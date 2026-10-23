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
  const [filas, ajustes] = await Promise.all([
    prisma.reserva.findMany({
      where: {
        liberadaEn: null,
        confirmadaEn: null,
        vence: { gt: new Date() },
        ...(excluirUsuarioId ? { usuarioId: { not: excluirUsuarioId } } : {}),
      },
      select: { disfrazFisicoId: true },
    }),
    // Ajustes de talla vivos: los disfraces con los que se intercambiaron piezas llevan una pieza de otra
    // talla, así que no se alquilan hasta que el ajuste se deshaga (el propio disfraz ajustado no cuenta aquí).
    prisma.reserva.findMany({
      where: { tipo: "AJUSTE_TALLA", liberadaEn: null },
      select: { disfrazFisicoId: true, movimientos: { select: { desdeId: true, haciaId: true } } },
    }),
  ]);

  const ids = new Set(filas.map((f) => f.disfrazFisicoId));
  for (const a of ajustes) {
    for (const m of a.movimientos) {
      for (const id of [m.desdeId, m.haciaId]) {
        if (id !== a.disfrazFisicoId) ids.add(id);
      }
    }
  }
  return ids;
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

// Desarma las reservas CONFIRMADAS (pagadas) cuyo disfraz ya no está alquilado ni en lavado:
// cada pieza vuelve al lugar donde estaba antes. Sirve para los disfraces a medida y, en la
// parte 10, para los disfraces del catálogo con tallas ajustadas.
// La reserva y sus movimientos se CONSERVAN como historial: solo se marca `liberadaEn`.
// Es segura de repetir: cada reserva se «reclama» de forma atómica, así que nunca se desarma
// dos veces, y si algo falla a medias la transacción se deshace y se reintenta después.
export async function desarmarReservasTerminadas(): Promise<number> {
  const candidatas = await prisma.reserva.findMany({
    where: {
      confirmadaEn: { not: null },
      liberadaEn: null,
      disfrazFisico: {
        estadoManual: null,
        alquileres: { none: { alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } } } },
      },
    },
    select: { id: true },
  });

  let desarmadas = 0;
  for (const { id } of candidatas) {
    try {
      const hecho = await prisma.$transaction(
        async (tx) => {
          const reclamada = await tx.reserva.updateMany({
            where: { id, confirmadaEn: { not: null }, liberadaEn: null },
            data: { liberadaEn: new Date() },
          });
          if (reclamada.count === 0) return false;

          const reserva = await tx.reserva.findUniqueOrThrow({
            where: { id },
            select: { disfrazFisicoId: true, disfrazFisico: { select: { origen: true } } },
          });
          const { omitidas } = await deshacerMovimientos(tx, id);

          // Red de seguridad: un disfraz a medida no tiene piezas propias, así que cualquier
          // pieza que siga dentro vuelve a su disfraz de origen.
          let rescatadas = 0;
          if (reserva.disfrazFisico.origen === "A_MEDIDA") {
            const restantes = await tx.prenda.findMany({
              where: { disfrazActualId: reserva.disfrazFisicoId },
              select: { id: true, disfrazHogarId: true },
            });
            for (const p of restantes) {
              await tx.prenda.update({ where: { id: p.id }, data: { disfrazActualId: p.disfrazHogarId } });
              rescatadas++;
            }
          }

          if (omitidas > 0 || rescatadas > 0) {
            console.warn(JSON.stringify({ tipo: "AUDITORIA", evento: "DESARMADO_CON_ANOMALIA", reservaId: id, omitidas, rescatadas }));
          }
          return true;
        },
        { timeout: 10_000 }
      );
      if (hecho) desarmadas++;
    } catch (error) {
      console.error("No se pudo desarmar la reserva", id, error);
    }
  }
  return desarmadas;
}