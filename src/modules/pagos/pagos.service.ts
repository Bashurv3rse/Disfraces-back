import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { CrearSesionInput } from "./pagos.schema";
import { crearAlquiler } from "../alquileres/alquileres.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export async function crearSesionCheckout(datos: CrearSesionInput, usuarioId: string) {
  const disfraces = await prisma.disfrazFisico.findMany({ where: { id: { in: datos.disfraces } } });
  if (disfraces.length !== datos.disfraces.length) {
    throw new Error("Alguno de los disfraces del carrito ya no existe");
  }

  const montoTotal = disfraces.reduce((s: number, d: { precioAlquiler: unknown }) => s + Number(d.precioAlquiler), 0);
  const montoGarantia = Math.round(montoTotal * 0.25 * 100) / 100;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = disfraces.map((d: { nombre: string; precioAlquiler: unknown }) => ({
    price_data: {
      currency: "pen",
      product_data: { name: `Alquiler: ${d.nombre}` },
      unit_amount: Math.round(Number(d.precioAlquiler) * 100),
    },
    quantity: 1,
  }));

  lineItems.push({
    price_data: {
      currency: "pen",
      product_data: { name: "Garantía (25%, reembolsable al devolver en buen estado)" },
      unit_amount: Math.round(montoGarantia * 100),
    },
    quantity: 1,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: `${FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/catalogo`,
    // La reserva real NO se crea aquí — solo al confirmar el pago (ver
    // confirmarPago) — esto evita alquileres "fantasma" de un pago que nunca se completó.
    metadata: {
      usuarioId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      evento: datos.evento || "",
      disfraces: JSON.stringify(datos.disfraces),
    },
  });

  return { url: session.url };
}

export async function confirmarPago(sessionId: string, usuarioId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    throw new Error("El pago aún no se ha confirmado con Stripe");
  }
  // Nunca confiar en el session_id sin más: debe pertenecer al usuario autenticado.
  if (session.metadata?.usuarioId !== usuarioId) {
    throw new Error("Esta sesión de pago no corresponde a tu usuario");
  }

  // Idempotencia: si el cliente recarga la página de éxito, no se duplica el alquiler.
  const existente = await prisma.alquiler.findUnique({
    where: { stripeSessionId: sessionId },
    include: { disfraces: { include: { disfrazFisico: true } } },
  });
  if (existente) return existente;

  const disfrazIds: string[] = JSON.parse(session.metadata!.disfraces);

  return crearAlquiler(
    {
      fechaInicio: session.metadata!.fechaInicio,
      fechaFin: session.metadata!.fechaFin,
      evento: session.metadata!.evento || undefined,
      disfraces: disfrazIds,
    },
    usuarioId,
    sessionId
  );
}