// Stripe Checkout (Payment Links) -> Revnu "payment_succeeded".
// Stripe signature check follows Stripe's documented manual verification:
// Stripe-Signature "t=<unix>,v1=<hex>", HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const REVNU_EVENTS_URL = 'https://revnu.com/api/measurement/events';
const TOLERANCE_SECONDS = 300; // Stripe's default replay window

// Stripe's zero-decimal currencies: amounts are already in major units
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

export function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = null;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || !v1.length) return false;
  if (Math.abs(nowSeconds - Number(t)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex'), 'utf8');
  return v1.some(sig => {
    const got = Buffer.from(sig, 'utf8');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// Stripe amounts are minor units (cents); Revnu wants major units (dollars)
export function toMajorUnits(amountMinor, currency) {
  return ZERO_DECIMAL.has(String(currency).toLowerCase()) ? amountMinor : amountMinor / 100;
}

function isoFrom(created, nowMs) {
  const ms = Number.isFinite(created) && created > 0 ? created * 1000 : nowMs;
  return new Date(ms).toISOString();
}

// Returns the Revnu event body, or null when this Stripe event is not a confirmed purchase
export function buildRevnuEvent(stripeEvent, nowMs = Date.now()) {
  const type = stripeEvent && stripeEvent.type;
  const s = stripeEvent && stripeEvent.data && stripeEvent.data.object;
  if (!s || s.object !== 'checkout.session') return null;
  if (type === 'checkout.session.completed') {
    if (s.payment_status !== 'paid') return null; // 'unpaid' waits for async_payment_succeeded; 'no_payment_required' is not a purchase
  } else if (type !== 'checkout.session.async_payment_succeeded') {
    return null;
  }
  if (!Number.isFinite(s.amount_total) || !s.currency) return null;

  const body = {
    event_id: `stripe_${s.id}`, // same session id on every retry and on the async follow-up, so Revnu deduplicates
    event_name: 'payment_succeeded',
    occurred_at: isoFrom(stripeEvent.created, nowMs),
    google_ad_user_data: 'unknown', // no per-visitor Google consent record exists for Payment Links
    google_ad_personalization: 'unknown',
    amount: toMajorUnits(s.amount_total, s.currency),
    currency: String(s.currency).toUpperCase(),
    properties: {}
  };
  const ref = s.client_reference_id;
  if (typeof ref === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(ref)) body.anonymous_id = ref;
  if (s.mode) body.properties.checkout_mode = s.mode;
  if (s.payment_link) body.properties.payment_link = s.payment_link;
  const d = s.customer_details || {};
  if (d.email) body.email = d.email;
  if (d.phone) body.phone = d.phone;
  return body;
}

const reply = (status, text) => new Response(text, { status, headers: { 'content-type': 'text/plain' } });

// Webhook handler. Returns non-2xx only when Stripe should retry the same event.
export async function handleStripeWebhook(req, { env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (req.method !== 'POST') return reply(405, 'method not allowed');
  const secret = env.STRIPE_WEBHOOK_SECRET, key = env.REVNU_EVENT_KEY;
  if (!secret || !key) { console.error('revnu-webhook: STRIPE_WEBHOOK_SECRET or REVNU_EVENT_KEY is not set'); return reply(500, 'not configured'); }

  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret, Math.floor(nowMs / 1000))) return reply(400, 'bad signature');

  let event;
  try { event = JSON.parse(raw); } catch { return reply(400, 'bad json'); }
  const body = buildRevnuEvent(event, nowMs);
  if (!body) return reply(200, 'ignored');

  let res;
  try {
    res = await fetchImpl(REVNU_EVENTS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('revnu-webhook: network error sending', body.event_id);
    return reply(502, 'revnu unreachable');
  }
  if (res.status === 200 || res.status === 202) return reply(200, `revnu ${res.status}`);
  console.error('revnu-webhook: revnu answered', res.status, 'for', body.event_id);
  if (res.status === 401) return reply(500, 'revnu key rejected');
  return reply(res.status === 429 || res.status >= 500 ? 503 : 500, `revnu ${res.status}`);
}
