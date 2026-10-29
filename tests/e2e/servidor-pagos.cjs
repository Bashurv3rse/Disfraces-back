// Servidor exclusivo de E2E. No se importa desde el arranque normal de la aplicación.
require('../integracion/setup');
const { randomUUID } = require('node:crypto');
const sesiones = new Map();
const rutaStripe = require.resolve('stripe');
require(rutaStripe);
require.cache[rutaStripe].exports = class StripeSimulado {
  checkout = { sessions: {
    create: async (parametros) => {
      const id = `cs_test_rtm_${randomUUID()}`;
      const url = `https://checkout.stripe.com/c/pay/${id}`;
      sesiones.set(id, { id, url, parametros: structuredClone(parametros) });
      return { id, url };
    },
    retrieve: async () => { throw new Error('Este servidor E2E no confirma pagos.'); },
  } };
  refunds = { create: async () => { throw new Error('Este servidor E2E no emite reembolsos.'); } };
};
const { app } = require('../../src/main');
app.get('/__e2e/stripe', (_req, res) => res.json({ modo: 'stripe-simulado', base: 'disfraz_test_db' }));
app.get('/__e2e/stripe/sesiones/:id', (req, res) => {
  const sesion = sesiones.get(req.params.id);
  if (!sesion) return res.status(404).json({ mensaje: 'Sesión simulada no encontrada' });
  return res.json(sesion);
});
app.listen(3000, '127.0.0.1', () => console.log('Backend E2E: disfraz_test_db; Stripe simulado, sin cobros.'));
