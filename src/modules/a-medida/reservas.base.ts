import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

// Plazos de una reserva sin pagar.
//  - INICIAL: tiempo para revisar el carrito y empezar el pago.
//  - PAGO: al iniciar el pago se amplía. Debe superar lo que dura la sesión de Stripe
//    (30 min) para que quede margen entre pagar y volver a la aplicación.
export const MINUTOS_RESERVA_INICIAL = 20;
export const MINUTOS_RESERVA_PAGO = 45;

// Se lanza cuando una reserva que debía confirmarse ya no está activa (venció o se canceló).
export class ReservaPerdida extends Error {
  constructor() {
    super("La reserva de un disfraz a medida ya no está activa.");
  }
}

type Transaccion = Prisma.TransactionClient;

// Disfraces con una reserva sin pagar y vigente. Si se indica un usuario, se excluyen
// las que son suyas (para él, su propia reserva no cuenta como «ocupada»).
export async function obtenerReservadosIds(excluirUsuarioId?: string): Promise<Set<string>> {
  const filas = await prisma.reserva.findMany({
    where: {
      liberadaEn: null,
      confirmadaEn: null,
      vence: { gt: new Date() },
      ...(excluirUsuarioId ? { usuarioId: { not: excluirUsuarioId } } : {}),
    },
    select: { disfrazFisicoId: true },
  });
  return new Set(filas.map((f) => f.disfrazFisicoId));
}

// Devuelve cada pieza al disfraz donde estaba antes, recorriendo los movimientos al revés.
// Solo mueve una pieza si sigue donde la dejó la reserva: si alguien la cambió de sitio
// mientras tanto, no se toca y se cuenta como «omitida».
export async function deshacerMovimientos(tx: Transaccion, reservaId: string) {
  const movimientos = await tx.movimientoPrenda.findMany({
    where: { reservaId },
    orderBy: { orden: "desc" },
  });

  let restauradas = 0;
  let omitidas = 0;
  for (const m of movimientos) {
    const r = await tx.prenda.updateMany({
      where: { id: m.prendaId, disfrazActualId: m.haciaId },
      data: { disfrazActualId: m.desdeId },
    });
    if (r.count === 1) restauradas++;
    else omitidas++;
  }
  return { restauradas, omitidas };
}

// Libera una reserva SIN pagar: devuelve las piezas y borra la reserva (y, si era un disfraz
// a medida, también el disfraz temporal). Devuelve false si ya no estaba activa.
// Todo ocurre en una transacción: o se deshace completo, o no se toca nada.
export async function liberarSinConfirmar(reservaId: string, soloDeUsuarioId?: string): Promise<boolean> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // «Reclamo» atómico: si otra petición ya la liberó o la confirmó, esta no hace nada.
        const reclamada = await tx.reserva.updateMany({
          where: {
            id: reservaId,
            liberadaEn: null,
            confirmadaEn: null,
            ...(soloDeUsuarioId ? { usuarioId: soloDeUsuarioId } : {}),
          },
          data: { liberadaEn: new Date() },
        });
        if (reclamada.count === 0) return false;

        const reserva = await tx.reserva.findUniqueOrThrow({
          where: { id: reservaId },
          select: { disfrazFisicoId: true, disfrazFisico: { select: { origen: true } } },
        });
        const esAMedida = reserva.disfrazFisico.origen === "A_MEDIDA";

        const { omitidas } = await deshacerMovimientos(tx, reservaId);

        const piezasAunAhi = esAMedida
          ? await tx.prenda.count({ where: { disfrazActualId: reserva.disfrazFisicoId } })
          : 0;
        const alquileres = esAMedida
          ? await tx.alquilerDisfraz.count({ where: { disfrazFisicoId: reserva.disfrazFisicoId } })
          : 0;

        // Algo no cuadra: se conserva el rastro (la reserva queda marcada como liberada)
        // en vez de borrar datos que alguien pueda necesitar para investigar.
        if (omitidas > 0 || piezasAunAhi > 0 || alquileres > 0) {
          console.warn(
            JSON.stringify({ tipo: "AUDITORIA", evento: "RESERVA_LIBERADA_CON_ANOMALIA", reservaId, omitidas, piezasAunAhi, alquileres })
          );
          return true;
        }

        await tx.reserva.delete({ where: { id: reservaId } }); // sus movimientos se borran en cascada
        if (esAMedida) {
          await tx.disfrazFisico.delete({ where: { id: reserva.disfrazFisicoId } });
        }
        return true;
      },
      { timeout: 10_000 }
    );
  } catch (error) {
    console.error("No se pudo liberar la reserva", reservaId, error);
    return false;
  }
}

// Libera todas las reservas sin pagar cuyo plazo ya venció. Devuelve cuántas liberó.
export async function liberarReservasVencidas(): Promise<number> {
  const vencidas = await prisma.reserva.findMany({
    where: { liberadaEn: null, confirmadaEn: null, vence: { lte: new Date() } },
    select: { id: true },
  });

  let liberadas = 0;
  for (const { id } of vencidas) {
    if (await liberarSinConfirmar(id)) liberadas++;
  }
  return liberadas;
}