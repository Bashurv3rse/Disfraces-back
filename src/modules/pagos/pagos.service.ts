import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { CrearSesionInput } from "./pagos.schema";
import { crearAlquiler } from "../alquileres/alquileres.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function calcularDias(fechaInicio: string, fechaFin: string): number {
  const msPorDia = 1000 * 60 * 60 * 24;
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  return Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / msPorDia));
}

export async function crearSesionCheckout(datos: CrearSesionInput, usuarioId: string) {
  const disfraces = await prisma.disfrazFisico.findMany({ where: { id: { in: datos.disfraces } } });
  if (disfraces.length !== datos.disfraces.length) {
    throw new Error("Alguno de los disfraces del carrito ya no existe");
  }

  const dias = calcularDias(datos.fechaInicio, datos.fechaFin);
  const montoTotal = disfraces.reduce((s: number, d: { precioAlquiler: unknown }) => s + Number(d.precioAlquiler), 0) * dias;
  const montoGarantia = Math.round(montoTotal * 0.25 * 100) / 100;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = disfraces.map((d: { nombre: string; precioAlquiler: unknown }) => ({
    price_data: {
      currency: "pen",
      product_data: { name: `Alquiler: ${d.nombre} (S/${Number(d.precioAlquiler)}/día)` },
      unit_amount: Math.round(Number(d.precioAlquiler) * 100),
    },
    quantity: dias,
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
  if (session.metadata?.usuarioId !== usuarioId) {
    throw new Error("Esta sesión de pago no corresponde a tu usuario");
  }

  const existente = await prisma.alquiler.findUnique({
    where: { stripeSessionId: sessionId },
    include: { disfraces: { include: { disfrazFisico: true } } },
  });
  if (existente) return existente;

  const disfrazIds: string[] = JSON.parse(session.metadata!.disfraces);

  try {
    return await crearAlquiler(
      {
        fechaInicio: session.metadata!.fechaInicio,
        fechaFin: session.metadata!.fechaFin,
        evento: session.metadata!.evento || undefined,
        disfraces: disfrazIds,
      },
      usuarioId,
      sessionId
    );
  } catch (error: any) {
    // Condición de carrera: dos peticiones casi simultáneas (típico de
    // React StrictMode en desarrollo, que duplica el efecto) pasaron el
    // chequeo de "no existe" al mismo tiempo. La primera ya lo creó — en
    // vez de fallar, devolvemos ese alquiler recién creado.
    if (error.code === "P2002" && error.meta?.target?.includes("stripeSessionId")) {
      const yaCreado = await prisma.alquiler.findUnique({
        where: { stripeSessionId: sessionId },
        include: { disfraces: { include: { disfrazFisico: true } } },
      });
      if (yaCreado) return yaCreado;
    }
    throw error;
  }
}