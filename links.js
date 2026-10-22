// KJ the Genie payment links. Each package has its own Stripe link.
// To change a price or run a special: make a new Payment Link in Stripe, paste it here, redeploy.
// Leave a link empty ('') and that button becomes "Text KJ to get started" instead.
window.KJ_LINKS = {
  website: 'https://buy.stripe.com/14A4gtb0c4kk0dI3uX83C02', // Website, $99 founding price
  setup:   'https://buy.stripe.com/28EdR33xK7ww6C63uX83C03', // Presence setup, $149
  bundle:  'https://buy.stripe.com/cNicMZ0lyaII2lQ6H983C04', // Get Found Bundle (Website + Presence setup), $199
  full:    'https://buy.stripe.com/dRmdR36JWdUU5y2ghJ83C05', // Full Genie (Website + Presence setup with a monthly plan), $149
  monthly: 'https://buy.stripe.com/9B6aERd8kcQQ3pUfdF83C06', // Monthly visit, $199/mo
  weekly:  'https://buy.stripe.com/5kQ3cp1pC2cc1hMd5x83C07', // Weekly visit, $399/mo
  // Your own .com: $45 up front (first year included), then $25/yr renewal starting a year later
  domain:         '', // .com on its own, $45
  website_domain: '', // Website + .com, $144
  bundle_domain:  '', // Get Found Bundle + .com, $244
  full_domain:    ''  // Full Genie + .com, $194
};
