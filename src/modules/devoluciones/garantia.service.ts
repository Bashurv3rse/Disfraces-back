import Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Error de regla de negocio, con el código HTTP que debe devolver el controller. Nunca 401.
export class ErrorGarantia extends Error {
  constructor(mensaje: string, public readonly estado: number = 400) {
    super(mensaje);
  }
}

const DETALLE = {
  alquiler: {
    include: {
      usuario: { select: { nombre: true, email: true } },
      disfraces: { include: { disfrazFisico: true } },
    },
  },
  prendas: { include: { prenda: true } },
  resueltaPor: { select: { nombre: true } },
} satisfies Prisma.DevolucionInclude;

export function obtenerDevolucion(id: string) {
  return prisma.devolucion.findUnique({ where: { id }, include: DETALLE });
}

type EstadoCorregido = "BUEN_ESTADO" | "DANADA" | "FALTANTE";

// El admin corrige lo que reportó el cliente. El reporte original se conserva en `estadoPrenda`; la corrección
// va en `estadoAdmin` (null = el admin confirmó lo reportado). El estado físico de la prenda se actualiza.
export async function corregirEstadoPrenda(devolucionId: string, prendaId: string, estado: EstadoCorregido, observacion?: string) {
  const dp = await prisma.devolucionPrenda.findFirst({
    where: { devolucionId, prendaId },
    include: {
      devolucion: { select: { garantiaEstado: true } },
      prenda: { select: { disfrazHogarId: true, disfrazActualId: true } },
    },
  });
  if (!dp) throw new ErrorGarantia("Esa prenda no pertenece a esta devolución.", 404);
  if (dp.devolucion.garantiaEstado !== "PENDIENTE") {
    throw new ErrorGarantia("La garantía ya fue resuelta: no se puede cambiar el estado de las prendas.", 409);
  }

  // Si el disfraz ya se alquiló de nuevo, no se toca el estado físico de sus piezas.
  const ocupados = await prisma.alquilerDisfraz.count({
    where: {
      disfrazFisicoId: { in: [dp.prenda.disfrazHogarId, dp.prenda.disfrazActualId] },
      alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } },
    },
  });
  if (ocupados > 0) {
    throw new ErrorGarantia("Esa prenda pertenece a un disfraz que ya está alquilado de nuevo: no se puede cambiar su estado físico.", 409);
  }

  await prisma.$transaction([
    prisma.devolucionPrenda.update({
      where: { id: dp.id },
      data: {
        estadoAdmin: estado === dp.estadoPrenda ? null : estado,
        ...(observacion !== undefined && { observacion: observacion.trim() || null }),
      },
    }),
    prisma.prenda.update({ where: { id: prendaId }, data: { estado: estado === "BUEN_ESTADO" ? "DISPONIBLE" : estado } }),
  ]);

  return obtenerDevolucion(devolucionId);
}

// Reembolso de la garantía en Stripe. Seguro de repetir: si ya existe un reembolso de esta devolución, se reutiliza.
async function reembolsarEnStripe(devolucionId: string, alquilerId: string, sessionId: string, centavos: number): Promise<string> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntent) throw new ErrorGarantia("No se encontró el pago de este alquiler en Stripe.", 409);

    const previos = await stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 });
    const existente = previos.data.find(
      (r) => r.metadata?.devolucionId === devolucionId && r.status !== "failed" && r.status !== "canceled"
    );
    if (existente) return existente.id;

    const reembolso = await stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount: centavos,
        reason: "requested_by_customer",
        metadata: { devolucionId, alquilerId, concepto: "garantia" },
      },
      { idempotencyKey: `garantia-${devolucionId}` }
    );
    return reembolso.id;
  } catch (error) {
    if (error instanceof ErrorGarantia) throw error;
    console.error("No se pudo reembolsar la garantía", devolucionId, error);
    throw new ErrorGarantia("Stripe no pudo procesar el reembolso. La garantía sigue pendiente: intenta de nuevo en unos segundos.", 502);
  }
}

interface Cierre {
  garantiaEstado: "DEVUELTA" | "RETENIDA";
  garantiaMonto: number;
  garantiaMotivo: string | null;
  garantiaReembolsoId: string | null;
}

// «Reclamo» atómico: solo una petición puede cerrar la garantía.
async function cerrar(id: string, cierre: Cierre, adminId: string) {
  const r = await prisma.devolucion.updateMany({
    where: { id, garantiaEstado: "PENDIENTE" },
    data: { ...cierre, garantiaResueltaEn: new Date(), garantiaResueltaPorId: adminId },
  });
  if (r.count === 0) throw new ErrorGarantia("La garantía de esta devolución ya fue resuelta.", 409);
  return obtenerDevolucion(id);
}

export async function resolverGarantia(id: string, accion: "DEVOLVER" | "RETENER", motivo: string | undefined, adminId: string) {
  const dev = await prisma.devolucion.findUnique({
    where: { id },
    include: { alquiler: { select: { id: true, montoGarantia: true, stripeSessionId: true } } },
  });
  if (!dev) throw new ErrorGarantia("Devolución no encontrada", 404);
  if (dev.garantiaEstado !== "PENDIENTE") throw new ErrorGarantia("La garantía de esta devolución ya fue resuelta.", 409);

  const monto = Number(dev.alquiler.montoGarantia);
  const motivoLimpio = motivo?.trim() || null;

  if (accion === "RETENER") {
    return cerrar(id, { garantiaEstado: "RETENIDA", garantiaMonto: monto, garantiaMotivo: motivoLimpio, garantiaReembolsoId: null }, adminId);
  }

  // Alquiler directo del admin (sin pago en Stripe) o garantía de S/ 0: se cierra «en mostrador».
  const centavos = Math.round(monto * 100);
  const reembolsoId =
    dev.alquiler.stripeSessionId && centavos > 0
      ? await reembolsarEnStripe(id, dev.alquiler.id, dev.alquiler.stripeSessionId, centavos)
      : null;

  return cerrar(id, { garantiaEstado: "DEVUELTA", garantiaMonto: monto, garantiaMotivo: motivoLimpio, garantiaReembolsoId: reembolsoId }, adminId);
}