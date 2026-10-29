// Solo Stripe en modo prueba y BD de test. No sustituye ninguna operación del SDK.
require('../integracion/setup');
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Se requiere una clave sk_test_ en .env.test.');
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173';
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 1, timeout: 20_000 });
async function iniciar() {
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) throw new Error('No se permite Stripe live.');
  const { app } = require('../../src/main');
  app.get('/__e2e/stripe-real', (_req, res) => res.json({ modo: 'stripe-real-test', base: 'disfraz_test_db', livemode: false }));
  app.listen(3000, '127.0.0.1', () => console.log('Backend E2E: disfraz_test_db; SDK Stripe real, modo TEST confirmado.'));
}
iniciar().catch(error => { console.error('No se pudo validar Stripe TEST:', error.code || error.type || 'error de conexión'); process.exitCode = 1; });
