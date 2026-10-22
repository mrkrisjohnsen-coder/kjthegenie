// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, buildRevnuEvent, toMajorUnits, handleStripeWebhook, REVNU_EVENTS_URL } from '../netlify/lib/revnu-stripe.mjs';

const SECRET = 'whsec_test_fake';
const ENV = { STRIPE_WEBHOOK_SECRET: SECRET, REVNU_EVENT_KEY: 'rsk_test_fake' };
const NOW = 1_800_000_000_000; // fixed clock, ms
const T = Math.floor(NOW / 1000);

const sign = (raw, t = T, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

function session(over = {}) {
  return {
    id: 'cs_live_abc', object: 'checkout.session', mode: 'payment', payment_status: 'paid',
    amount_total: 9900, currency: 'usd', client_reference_id: 'anon_123',
    payment_link: 'plink_x', customer_details: { email: 'a@b.co', phone: '+18645550000' }, ...over
  };
}
const evt = (type = 'checkout.session.completed', s = session(), created = T) => ({ id: 'evt_1', type, created, data: { object: s } });

function req(eventObj, { header, method = 'POST' } = {}) {
  const raw = JSON.stringify(eventObj);
  return new Request('https://kjthegenie.netlify.app/.netlify/functions/stripe-webhook', {
    method, body: method === 'POST' ? raw : undefined,
    headers: { 'stripe-signature': header === undefined ? sign(raw) : header }
  });
}

function fakeFetch(...statuses) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response('', { status: statuses[Math.min(calls.length - 1, statuses.length - 1)] }); };
  fn.calls = calls;
  return fn;
}

// --- signature validation
test('valid Stripe signature passes', () => {
  assert.equal(verifyStripeSignature('{"a":1}', sign('{"a":1}'), SECRET, T), true);
});
test('wrong secret, tampered body, missing header and stale timestamp fail', () => {
  assert.equal(verifyStripeSignature('{"a":1}', sign('{"a":1}', T, 'whsec_other'), SECRET, T), false);
  assert.equal(verifyStripeSignature('{"a":2}', sign('{"a":1}'), SECRET, T), false);
  assert.equal(verifyStripeSignature('{"a":1}', null, SECRET, T), false);
  assert.equal(verifyStripeSignature('{"a":1}', 'garbage', SECRET, T), false);
  assert.equal(verifyStripeSignature('{"a":1}', sign('{"a":1}', T - 301), SECRET, T), false);
});
test('handler rejects a bad signature without calling Revnu', async () => {
  const f = fakeFetch(200);
  const r = await handleStripeWebhook(req(evt(), { header: 't=1,v1=00' }), { env: ENV, fetchImpl: f, nowMs: NOW });
  assert.equal(r.status, 400);
  assert.equal(f.calls.length, 0);
});
test('handler refuses to run without its secrets', async () => {
  const r = await handleStripeWebhook(req(evt()), { env: {}, fetchImpl: fakeFetch(200), nowMs: NOW });
  assert.equal(r.status, 500);
});
test('non-POST is rejected', async () => {
  const r = await handleStripeWebhook(req(evt(), { method: 'GET' }), { env: ENV, fetchImpl: fakeFetch(200), nowMs: NOW });
  assert.equal(r.status, 405);
});

// --- supported and wrong events
test('paid checkout.session.completed sends payment_succeeded with the key', async () => {
  const f = fakeFetch(200);
  const r = await handleStripeWebhook(req(evt()), { env: ENV, fetchImpl: f, nowMs: NOW });
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 1);
  const c = f.calls[0];
  assert.equal(c.url, REVNU_EVENTS_URL);
  assert.equal(c.init.headers.authorization, 'Bearer rsk_test_fake');
  assert.equal(c.body.event_name, 'payment_succeeded');
  assert.equal(c.body.event_id, 'stripe_cs_live_abc');
  assert.equal(c.body.amount, 99);
  assert.equal(c.body.currency, 'USD');
  assert.equal(c.body.anonymous_id, 'anon_123');
  assert.equal(c.body.google_ad_user_data, 'unknown');
  assert.equal(c.body.google_ad_personalization, 'unknown');
  assert.equal(c.body.email, 'a@b.co');
  assert.equal(c.body.phone, '+18645550000');
  assert.equal('consent_state' in c.body, false); // nothing saved for this outcome, so omitted
  assert.equal(JSON.stringify(c.body.properties).includes('@'), false); // no identity in properties
});
test('async_payment_succeeded is counted', () => {
  const b = buildRevnuEvent(evt('checkout.session.async_payment_succeeded', session({ payment_status: 'paid' })), NOW);
  assert.equal(b.event_name, 'payment_succeeded');
});
test('unpaid, no-payment-required, other event types and other objects are ignored', async () => {
  assert.equal(buildRevnuEvent(evt('checkout.session.completed', session({ payment_status: 'unpaid' })), NOW), null);
  assert.equal(buildRevnuEvent(evt('checkout.session.completed', session({ payment_status: 'no_payment_required' })), NOW), null);
  assert.equal(buildRevnuEvent(evt('checkout.session.async_payment_failed'), NOW), null);
  assert.equal(buildRevnuEvent(evt('checkout.session.expired'), NOW), null);
  assert.equal(buildRevnuEvent(evt('payment_intent.succeeded', { object: 'payment_intent', id: 'pi_1' }), NOW), null);
  const f = fakeFetch(200);
  const r = await handleStripeWebhook(req(evt('customer.created', { object: 'customer', id: 'cus_1' })), { env: ENV, fetchImpl: f, nowMs: NOW });
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 0);
});

// --- stable id deduplication
test('completed and async follow-up for one session share an event_id', () => {
  const a = buildRevnuEvent(evt('checkout.session.completed'), NOW);
  const b = buildRevnuEvent(evt('checkout.session.async_payment_succeeded'), NOW + 5000);
  assert.equal(a.event_id, b.event_id);
});

// --- missing anonymous id
test('missing or malformed client_reference_id omits anonymous_id but still counts', () => {
  assert.equal('anonymous_id' in buildRevnuEvent(evt('checkout.session.completed', session({ client_reference_id: null })), NOW), false);
  assert.equal('anonymous_id' in buildRevnuEvent(evt('checkout.session.completed', session({ client_reference_id: 'has space' })), NOW), false);
});

// --- occurred_at
test('occurred_at is ISO from the Stripe event time, falling back to now when malformed', () => {
  assert.equal(buildRevnuEvent(evt(), NOW).occurred_at, new Date(T * 1000).toISOString());
  assert.equal(buildRevnuEvent(evt('checkout.session.completed', session(), 'yesterday'), NOW).occurred_at, new Date(NOW).toISOString());
  assert.equal(buildRevnuEvent(evt('checkout.session.completed', session(), undefined), NOW).occurred_at, new Date(NOW).toISOString());
});

// --- amounts
test('minor units are converted to major units', () => {
  assert.equal(toMajorUnits(19900, 'usd'), 199);
  assert.equal(toMajorUnits(1250, 'gbp'), 12.5);
  assert.equal(toMajorUnits(500, 'jpy'), 500);
});

// --- upstream responses and retries
test('Revnu 202 is accepted', async () => {
  const r = await handleStripeWebhook(req(evt()), { env: ENV, fetchImpl: fakeFetch(202), nowMs: NOW });
  assert.equal(r.status, 200);
});
test('Revnu 429 and 5xx ask Stripe to retry; the retry reuses the same event_id', async () => {
  const f = fakeFetch(429, 503, 200);
  const e = evt();
  assert.equal((await handleStripeWebhook(req(e), { env: ENV, fetchImpl: f, nowMs: NOW })).status, 503);
  assert.equal((await handleStripeWebhook(req(e), { env: ENV, fetchImpl: f, nowMs: NOW })).status, 503);
  assert.equal((await handleStripeWebhook(req(e), { env: ENV, fetchImpl: f, nowMs: NOW })).status, 200);
  assert.deepEqual(f.calls.map(c => c.body.event_id), ['stripe_cs_live_abc', 'stripe_cs_live_abc', 'stripe_cs_live_abc']);
});
test('Revnu 401 is a server error so Stripe keeps retrying after the key is fixed', async () => {
  const r = await handleStripeWebhook(req(evt()), { env: ENV, fetchImpl: fakeFetch(401), nowMs: NOW });
  assert.equal(r.status, 500);
});
test('network failure asks Stripe to retry', async () => {
  const boom = async () => { throw new Error('down'); };
  const r = await handleStripeWebhook(req(evt()), { env: ENV, fetchImpl: boom, nowMs: NOW });
  assert.equal(r.status, 502);
});

// --- lifecycle: refunds stay counted
test('refund events never send a reversal', async () => {
  const f = fakeFetch(200);
  const refund = { id: 'evt_r', type: 'charge.refunded', created: T, data: { object: { object: 'charge', id: 'ch_1', refunded: true } } };
  const r = await handleStripeWebhook(req(refund), { env: ENV, fetchImpl: f, nowMs: NOW });
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 0);
  assert.equal(buildRevnuEvent(evt()).reversal_of, undefined);
});
