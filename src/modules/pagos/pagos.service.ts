import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { CrearSesionInput } from "./pagos.schema";
import { crearAlquiler } from "../alquileres/alquileres.service";
import type { PreciosAlquiler } from "../alquileres/alquileres.service";
import { disfracesNoDisponibles } from "../disfraces/disfraces.service";
import { cotizar, ErrorCotizacion } from "./precios.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const TEXTO_ESTADO: Record<string, string> = {
  ALQUILADO: "está alquilado",
  INCOMPLETO: "está incompleto",
  SUSPENDIDO: "está en lavado",
  EN_REPARACION: "está en reparación",
};

export async function crearSesionCheckout(datos: CrearSesionInput, usuarioId: string) {
  // El precio SIEMPRE lo calcula el servidor (precios.service): lo que se muestra en el
  // carrito, lo que cobra Stripe y lo que se guarda en el alquiler salen del mismo cálculo.
  const cotizacion = await cotizar(datos);

  // Si el cliente escribió un código que no sirve, se rechaza en vez de cobrarle sin descuento
  // sin que lo sepa. (Un código válido pero sin efecto, por haber una oferta mejor, sí pasa.)
  if (cotizacion.codigo && !cotizacion.codigo.valido) {
    throw new ErrorCotizacion(cotizacion.codigo.mensaje);
  }

  const noDisponibles = await disfracesNoDisponibles(datos.disfraces);
  if (noDisponibles.length > 0) {
    const detalle = noDisponibles
      .map((d) => `«${d.nombre}» ${TEXTO_ESTADO[d.estado] ?? "no está disponible"}`)
      .join("; ");
    throw new ErrorCotizacion(`${detalle}, y no se puede alquilar ahora. Quítalo del carrito para continuar.`, 409);
  }

  // Cada disfraz va como una línea con su total ya calculado (en céntimos enteros), así
  // la suma en Stripe coincide exactamente con la cotización.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cotizacion.lineas.map((l, i) => {
    const oferta = l.promocion ? `, ${l.promocion.porcentaje}% dto.` : "";
    return {
      price_data: {
        currency: "pen",
        product_data: {
          name: `Alquiler: ${l.nombre} (S/${l.precioDia.toFixed(2)}/día × ${l.dias} día${l.dias > 1 ? "s" : ""}${oferta})`,
        },
        unit_amount: cotizacion.centavos.lineas[i],
      },
      quantity: 1,
    };
  });

  lineItems.push({
    price_data: {
      currency: "pen",
      product_data: { name: "Garantía (25%, reembolsable al devolver en buen estado)" },
      unit_amount: cotizacion.centavos.garantia,
    },
    quantity: 1,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: `${FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/catalogo`,
    // La reserva real NO se crea aquí, solo al confirmar el pago (ver confirmarPago).
    // Los montos cotizados viajan en la sesión: si una oferta cambia mientras el cliente
    // paga, se registra lo que realmente pagó.
    metadata: {
      usuarioId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      evento: datos.evento || "",
      disfraces: JSON.stringify(datos.disfraces),
      montoTotalCent: String(cotizacion.centavos.totalAlquiler),
      garantiaCent: String(cotizacion.centavos.garantia),
      descuentoCent: String(cotizacion.centavos.descuento),
      detalleDescuento: cotizacion.detalleDescuento ?? "",
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

  const meta = session.metadata!;
  const disfrazIds: string[] = JSON.parse(meta.disfraces);

  // Los montos guardados son los de la cotización original, y deben coincidir con lo que
  // Stripe realmente cobró. Si no, algo se alteró y no se crea el alquiler.
  let precios: PreciosAlquiler | undefined;
  if (meta.montoTotalCent && meta.garantiaCent) {
    const totalCent = Number(meta.montoTotalCent);
    const garantiaCent = Number(meta.garantiaCent);
    if (session.amount_total !== totalCent + garantiaCent) {
      throw new Error("El monto cobrado no coincide con la cotización de esta reserva. Contacta a la tienda.");
    }
    precios = {
      montoTotal: totalCent / 100,
      montoGarantia: garantiaCent / 100,
      descuento: Number(meta.descuentoCent || 0) / 100,
      detalleDescuento: meta.detalleDescuento || null,
    };
  }
  // Sin esos montos (sesión creada antes de existir los descuentos), el alquiler recalcula su precio.

  try {
    return await crearAlquiler(
      {
        fechaInicio: meta.fechaInicio,
        fechaFin: meta.fechaFin,
        evento: meta.evento || undefined,
        disfraces: disfrazIds,
      },
      usuarioId,
      { stripeSessionId: sessionId, precios }
    );
  } catch (error: any) {
    // Condición de carrera: dos peticiones casi simultáneas (típico de React StrictMode en
    // desarrollo) pasaron el chequeo de "no existe" a la vez. La primera ya lo creó.
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