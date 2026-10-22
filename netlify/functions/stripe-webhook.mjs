// Stripe sends paid Checkout Sessions here; we verify them and report the purchase to Revnu.
// Needs STRIPE_WEBHOOK_SECRET and REVNU_EVENT_KEY in the Netlify project's environment variables.
import { handleStripeWebhook } from '../lib/revnu-stripe.mjs';

export default async (req) => handleStripeWebhook(req, { env: process.env });
