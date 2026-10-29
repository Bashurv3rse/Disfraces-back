// Consumidor independiente: sin importar la aplicación, Prisma ni acceder a BD.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../../.env.test')));
if (env.NODE_ENV !== 'test' || !env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) process.exit(2);
const stripe = new (require('stripe'))(env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 });
const runId = randomUUID();
let terminar = false;
process.on('message', m => { if (m === 'detener') terminar = true; });
process.on('disconnect', () => { terminar = true; });
const enviar = m => { if (process.connected) process.send(m); };
const operaciones = [];
async function medir(nombre, fn) {
  const inicio = Date.now();
  const valor = await fn();
  operaciones.push({ nombre, inicio, fin: Date.now(), duracionMs: Date.now() - inicio });
  return valor;
}
(async () => {
  let intent;
  let error;
  const inicio = Date.now();
  let lecturas = 0;
  try {
    if ((await stripe.balance.retrieve()).livemode !== false) throw new Error('modo_invalido');
    const cuenta = await stripe.accounts.retrieve(null);
    intent = await medir('crear', () => stripe.paymentIntents.create({
      amount: 700, currency: 'pen', metadata: { consumidor: 'independiente-coexistencia', runId },
      automatic_payment_methods: { enabled: true },
    }, { idempotencyKey: `coexistencia-${runId}` }));
    enviar({ tipo: 'listo', cuentaId: cuenta.id, intentId: intent.id, runId, inicio });
    while (!terminar && Date.now() - inicio < 120000) {
      const actual = await medir('consultar', () => stripe.paymentIntents.retrieve(intent.id));
      if (actual.amount !== 700 || actual.currency !== 'pen' || actual.status !== 'requires_payment_method' ||
          actual.metadata.runId !== runId || actual.livemode !== false) throw new Error('interferencia');
      lecturas++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (e) { error = e.code || e.type || 'fallo_consumidor'; }
  finally {
    let cancelado = false;
    if (intent) {
      try {
        const final = await medir('cancelar', () => stripe.paymentIntents.cancel(intent.id));
        cancelado = final.status === 'canceled' && final.amount === 700 && final.metadata.runId === runId;
        if (!cancelado) error = 'cancelacion_invalida';
      } catch (e) { error = e.code || e.type || 'fallo_limpieza'; }
    }
    enviar({ tipo: 'fin', intentId: intent?.id, runId, inicio, fin: Date.now(), lecturas, cancelado, operaciones, error });
    process.exitCode = error ? 1 : 0;
    if (process.connected) process.disconnect();
  }
})();
