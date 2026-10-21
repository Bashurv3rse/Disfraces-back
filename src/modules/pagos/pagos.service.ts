import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { CrearSesionInput } from "./pagos.schema";
import { crearAlquiler } from "../alquileres/alquileres.service";
import type { PreciosAlquiler } from "../alquileres/alquileres.service";
import { disfracesNoDisponibles } from "../disfraces/disfraces.service";
import { cotizar, ErrorCotizacion } from "./precios.service";
import { extenderReservasDelCarrito, prepararCarrito } from "./carrito.service";
import { ReservaPerdida, liberarSinConfirmar } from "../a-medida/reservas.base";
import { registrarEventoSeguridad } from "../../common/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Stripe no acepta sesiones de menos de 30 minutos. Con reservas de por medio, la sesión
// vence a los 31 y las reservas (45 min tras iniciar el pago) quedan 14 minutos más largas.
const MINUTOS_SESION_CON_RESERVA = 31;

const TEXTO_ESTADO: Record<string, string> = {
  ALQUILADO: "está alquilado",
  RESERVADO: "está reservado por otra persona",
  INCOMPLETO: "está incompleto",
  SUSPENDIDO: "está en lavado",
  EN_REPARACION: "está en reparación",
};

export async function crearSesionCheckout(datos: CrearSesionInput, usuarioId: string) {
  // Todo lo que hay en el carrito debe poder comprarse ahora; los disfraces a medida deben
  // tener una reserva vigente a nombre de quien paga.
  const { reservas } = await prepararCarrito(datos.disfraces, usuarioId);

  // El precio SIEMPRE lo calcula el servidor (precios.service): lo que se muestra en el
  // carrito, lo que cobra Stripe y lo que se guarda en el alquiler salen del mismo cálculo.
  const cotizacion = await cotizar(datos);

  // Si el cliente escribió un código que no sirve, se rechaza en vez de cobrarle sin descuento
  // sin que lo sepa. (Un código válido pero sin efecto, por haber una oferta mejor, sí pasa.)
  if (cotizacion.codigo && !cotizacion.codigo.valido) {
    throw new ErrorCotizacion(cotizacion.codigo.mensaje);
  }

  const noDisponibles = await disfracesNoDisponibles(datos.disfraces, usuarioId);
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

  // Se amplía el plazo de las reservas ANTES de crear la sesión: si alguna ya se perdió, se
  // avisa ahora y no después de que el cliente haya pagado.
  await extenderReservasDelCarrito(reservas, usuarioId);

  const parametros: Stripe.Checkout.SessionCreateParams = {
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
      reservasIds: JSON.stringify(reservas.map((r) => r.reservaId)),
      montoTotalCent: String(cotizacion.centavos.totalAlquiler),
      garantiaCent: String(cotizacion.centavos.garantia),
      descuentoCent: String(cotizacion.centavos.descuento),
      detalleDescuento: cotizacion.detalleDescuento ?? "",
    },
  };
  if (reservas.length > 0) {
    parametros.expires_at = Math.floor(Date.now() / 1000) + MINUTOS_SESION_CON_RESERVA * 60;
  }

  const session = await stripe.checkout.sessions.create(parametros);
  return { url: session.url };
}

// ¿Alguna de las reservas del carrito ya se liberó o ya no existe? Una reserva sin pagar cuyo
// plazo venció, pero que nadie liberó todavía, sigue valiendo: un pago ya hecho se respeta.
async function hayReservaPerdida(reservasIds: string[], usuarioId: string): Promise<boolean> {
  const vivas = await prisma.reserva.findMany({
    where: { id: { in: reservasIds }, usuarioId, liberadaEn: null },
    select: { id: true },
  });
  return vivas.length !== reservasIds.length;
}

// El pago llegó pero las piezas ya no están apartadas (volvieron al almacén). Cobrar un disfraz
// que no se puede entregar sería lo peor: se reembolsa el pago completo y se explica.
async function reembolsarPorReservaPerdida(
  session: Stripe.Checkout.Session,
  reservasIds: string[],
  usuarioId: string
): Promise<never> {
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  let reembolsado = false;
  if (paymentIntent) {
    try {
      // La clave de idempotencia evita un doble reembolso si el cliente recarga la página.
      await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `reembolso-reserva-${session.id}` });
      reembolsado = true;
    } catch (error: any) {
      if (error?.code === "charge_already_refunded") reembolsado = true;
      else console.error("No se pudo reembolsar el pago", session.id, error);
    }
  }

  registrarEventoSeguridad({
    evento: reembolsado ? "PAGO_REEMBOLSADO_RESERVA_PERDIDA" : "PAGO_REEMBOLSO_FALLIDO",
    usuarioId,
    detalle: session.id,
  });

  // Las demás reservas de ese carrito que sigan sin pagar se liberan: ese alquiler ya no se hará.
  for (const id of reservasIds) {
    await liberarSinConfirmar(id, usuarioId);
  }

  throw new Error(
    reembolsado
      ? "Tu pago fue reembolsado completo porque el disfraz a medida que habías apartado ya no estaba reservado (se acabó el tiempo de la reserva). El reembolso puede tardar unos días en verse en tu tarjeta. Puedes armar el disfraz de nuevo cuando quieras."
      : `No pudimos completar tu alquiler y tampoco logramos reembolsar el pago de forma automática. Contacta a la tienda indicando este código de pago: ${session.id}.`
  );
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
  const reservasIds: string[] = meta.reservasIds ? JSON.parse(meta.reservasIds) : [];

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

  // Pago que llega tarde: las piezas ya volvieron al almacén.
  if (reservasIds.length > 0 && (await hayReservaPerdida(reservasIds, usuarioId))) {
    return reembolsarPorReservaPerdida(session, reservasIds, usuarioId);
  }

  try {
    // El alquiler y la confirmación de las reservas ocurren en una sola transacción.
    return await crearAlquiler(
      {
        fechaInicio: meta.fechaInicio,
        fechaFin: meta.fechaFin,
        evento: meta.evento || undefined,
        disfraces: disfrazIds,
      },
      usuarioId,
      { stripeSessionId: sessionId, precios, reservasIds }
    );
  } catch (error: any) {
    // Condición de carrera: dos peticiones casi simultáneas (típico de React StrictMode en
    // desarrollo) pasaron el chequeo de «no existe» a la vez. La primera ya lo creó.
    if (error.code === "P2002" && error.meta?.target?.includes("stripeSessionId")) {
      const yaCreado = await prisma.alquiler.findUnique({
        where: { stripeSessionId: sessionId },
        include: { disfraces: { include: { disfrazFisico: true } } },
      });
      if (yaCreado) return yaCreado;
    }

    // La reserva se perdió justo entre la comprobación y la transacción (o su disfraz
    // temporal ya se borró): se reembolsa igual que arriba.
    if (
      reservasIds.length > 0 &&
      (error instanceof ReservaPerdida || (error instanceof ErrorCotizacion && error.estado === 404))
    ) {
      return reembolsarPorReservaPerdida(session, reservasIds, usuarioId);
    }
    throw error;
  }
}