import { prisma } from "../../config/prisma";
import { CrearSesionInput } from "./pagos.schema";
import { crearAlquiler } from "../alquileres/alquileres.service";
import type { PreciosAlquiler } from "../alquileres/alquileres.service";
import { disfracesNoDisponibles } from "../disfraces/disfraces.service";
import { rangoDesdeTexto } from "../disfraces/rango";
import { cotizar, ErrorCotizacion } from "./precios.service";
import { extenderReservasDelCarrito, prepararCarrito } from "./carrito.service";
import { ReservaPerdida, liberarSinConfirmar } from "../a-medida/reservas.base";
import { registrarEventoSeguridad } from "../../common/logger";
import { ErrorPasarela, YA_REEMBOLSADO } from "./pasarela-pago";
import type { PagoRegistrado, SolicitudDeCobro } from "./pasarela-pago";
import { pasarelaDePago } from "./pasarela.config";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Stripe no acepta sesiones de menos de 30 minutos. Con reservas de por medio, la sesión
// vence a los 31 y las reservas (45 min tras iniciar el pago) quedan 14 minutos más largas.
const MINUTOS_SESION_CON_RESERVA = 31;

const TEXTO_ESTADO: Record<string, string> = {
  ALQUILADO: "está alquilado",
  RESERVADO: "está reservado en este momento",
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

  const noDisponibles = await disfracesNoDisponibles(
    datos.disfraces,
    usuarioId,
    rangoDesdeTexto(datos.fechaInicio, datos.fechaFin)
  );
  if (noDisponibles.length > 0) {
    const detalle = noDisponibles
      .map((d) => `«${d.nombre}» ${TEXTO_ESTADO[d.estado] ?? "no está disponible"}`)
      .join("; ");
    throw new ErrorCotizacion(`${detalle}, y no se puede alquilar ahora. Quítalo del carrito para continuar.`, 409);
  }

  // Cada disfraz va como una línea con su total ya calculado (en céntimos enteros), así
  // la suma que cobra la pasarela coincide exactamente con la cotización.
  const lineas = cotizacion.lineas.map((l, i) => {
    const oferta = l.promocion ? `, ${l.promocion.porcentaje}% dto.` : "";
    return {
      nombre: `Alquiler: ${l.nombre} (S/${l.precioDia.toFixed(2)}/día × ${l.dias} día${l.dias > 1 ? "s" : ""}${oferta})`,
      centavos: cotizacion.centavos.lineas[i],
    };
  });

  lineas.push({ nombre: "Garantía (25%, reembolsable al devolver en buen estado)", centavos: cotizacion.centavos.garantia });

  // Se amplía el plazo de las reservas ANTES de crear la sesión: si alguna ya se perdió, se
  // avisa ahora y no después de que el cliente haya pagado.
  await extenderReservasDelCarrito(reservas, usuarioId);

  const solicitud: SolicitudDeCobro = {
    lineas,
    moneda: "pen",
    urlExito: `${FRONTEND_URL}/pago-exitoso?session_id={ID_SESION}`,
    urlCancelacion: `${FRONTEND_URL}/catalogo`,
    descripcionComprobante: "Alquiler de disfraces (incluye garantía reembolsable)",
    usuarioId,
    // La reserva real NO se crea aquí, solo al confirmar el pago (ver confirmarPago).
    // Los montos cotizados viajan con el cobro: si una oferta cambia mientras el cliente
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
  if (reservas.length > 0) solicitud.minutosDeVigencia = MINUTOS_SESION_CON_RESERVA;

  return pasarelaDePago().crearCobro(solicitud);
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
  session: PagoRegistrado,
  reservasIds: string[],
  usuarioId: string
): Promise<never> {
  let reembolsado = false;
  if (session.idCobro) {
    try {
      // La clave de idempotencia evita un doble reembolso si el cliente recarga la página.
      await pasarelaDePago().reembolsar({ idCobro: session.idCobro, claveIdempotencia: `reembolso-reserva-${session.id}` });
      reembolsado = true;
    } catch (error: any) {
      if (error instanceof ErrorPasarela && error.codigo === YA_REEMBOLSADO) reembolsado = true;
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
      ? "Tu pago fue reembolsado completo porque la reserva de tu disfraz (a medida o con tallas ajustadas) ya no estaba activa: se acabó el tiempo. El reembolso puede tardar unos días en verse en tu tarjeta. Puedes volver a reservarlo cuando quieras."
      : `No pudimos completar tu alquiler y tampoco logramos reembolsar el pago de forma automática. Contacta a la tienda indicando este código de pago: ${session.id}.`
  );
}

const INCLUIR_ALQUILER = { disfraces: { include: { disfrazFisico: true } } } as const;

// El pago debe estar cobrado y pertenecer al usuario autenticado (nunca confiar en el session_id sin más).
function validarSesionPagada(session: PagoRegistrado, usuarioId: string) {
  if (!session.pagado) {
    throw new Error("El pago aún no se ha confirmado con Stripe");
  }
  if (session.metadata.usuarioId !== usuarioId) {
    throw new Error("Esta sesión de pago no corresponde a tu usuario");
  }
}

// Los montos guardados son los de la cotización original, y deben coincidir con lo que
// Stripe realmente cobró. Si no, algo se alteró y no se crea el alquiler.
// Sin esos montos (sesión creada antes de existir los descuentos), el alquiler recalcula su precio.
function preciosDeLaSesion(session: PagoRegistrado, meta: Record<string, string>): PreciosAlquiler | undefined {
  if (!meta.montoTotalCent || !meta.garantiaCent) return undefined;
  const totalCent = Number(meta.montoTotalCent);
  const garantiaCent = Number(meta.garantiaCent);
  if (session.montoTotalCentavos !== totalCent + garantiaCent) {
    throw new Error("El monto cobrado no coincide con la cotización de esta reserva. Contacta a la tienda.");
  }
  return {
    montoTotal: totalCent / 100,
    montoGarantia: garantiaCent / 100,
    descuento: Number(meta.descuentoCent || 0) / 100,
    detalleDescuento: meta.detalleDescuento || null,
  };
}

// Condición de carrera: dos peticiones casi simultáneas (típico de React StrictMode en
// desarrollo) pasaron el chequeo de «no existe» a la vez. La primera ya lo creó.
function esAlquilerDuplicado(error: any): boolean {
  return error.code === "P2002" && !!error.meta?.target?.includes("stripeSessionId");
}

// La reserva se perdió justo entre la comprobación y la transacción (o su disfraz
// temporal ya se borró): se reembolsa igual que cuando se detecta antes.
function esReservaPerdida(error: unknown): boolean {
  return error instanceof ReservaPerdida || (error instanceof ErrorCotizacion && error.estado === 404);
}

export async function confirmarPago(sessionId: string, usuarioId: string) {
  const session = await pasarelaDePago().obtenerPago(sessionId);
  validarSesionPagada(session, usuarioId);

  // Idempotencia: si el cliente recarga la página de éxito, no se duplica el alquiler.
  const existente = await prisma.alquiler.findUnique({ where: { stripeSessionId: sessionId }, include: INCLUIR_ALQUILER });
  if (existente) return existente;

  const meta = session.metadata;
  const disfrazIds: string[] = JSON.parse(meta.disfraces);
  const reservasIds: string[] = meta.reservasIds ? JSON.parse(meta.reservasIds) : [];
  const precios = preciosDeLaSesion(session, meta);

  // Pago que llega tarde: las piezas ya volvieron al almacén.
  if (reservasIds.length > 0 && (await hayReservaPerdida(reservasIds, usuarioId))) {
    return reembolsarPorReservaPerdida(session, reservasIds, usuarioId);
  }

  try {
    // El alquiler y la confirmación de las reservas ocurren en una sola transacción.
    return await crearAlquiler(
      { fechaInicio: meta.fechaInicio, fechaFin: meta.fechaFin, evento: meta.evento || undefined, disfraces: disfrazIds },
      usuarioId,
      { stripeSessionId: sessionId, precios, reservasIds }
    );
  } catch (error: any) {
    if (esAlquilerDuplicado(error)) {
      const yaCreado = await prisma.alquiler.findUnique({ where: { stripeSessionId: sessionId }, include: INCLUIR_ALQUILER });
      if (yaCreado) return yaCreado;
    }
    if (reservasIds.length > 0 && esReservaPerdida(error)) {
      return reembolsarPorReservaPerdida(session, reservasIds, usuarioId);
    }
    throw error;
  }
}

export interface BoletaPago {
  // «pdf»: descarga directa del PDF de la factura; «recibo»: página de recibo de Stripe (con opción de descargar).
  tipo: "pdf" | "recibo";
  url: string;
}

// Enlace para que el cliente descargue la boleta de un pago suyo. Se apoya en Stripe: primero la
// factura en PDF; si no existe (pagos hechos antes de activarlas), el recibo del cobro.
export async function obtenerBoleta(sessionId: string, usuarioId: string): Promise<BoletaPago> {
  const comprobante = await pasarelaDePago().obtenerComprobante(sessionId);

  if (!comprobante.pagado) throw new Error("El pago aún no se ha confirmado con Stripe");
  // Igual que al confirmar: solo el dueño del pago puede pedir su boleta.
  if (comprobante.usuarioId !== usuarioId) throw new Error("Esta sesión de pago no corresponde a tu usuario");

  if (comprobante.facturaPdf) return { tipo: "pdf", url: comprobante.facturaPdf };
  if (comprobante.reciboUrl) return { tipo: "recibo", url: comprobante.reciboUrl };

  throw new Error("Stripe todavía no generó la boleta de este pago. Inténtalo de nuevo en unos segundos.");
}
