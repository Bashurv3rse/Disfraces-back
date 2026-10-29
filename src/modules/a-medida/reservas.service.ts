import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { proponerArmado } from "./armado.service";
import type { PropuestaArmado, TallasPedido } from "./armado.service";
import {
  MINUTOS_RESERVA_INICIAL,
  MINUTOS_RESERVA_PAGO,
  liberarReservasVencidas,
  liberarSinConfirmar,
} from "./reservas.base";

// Cuántos disfraces a medida puede tener una persona apartados sin haber pagado.
export const MAX_RESERVAS_SIN_PAGAR = 3;

const INTENTOS = 2;

export class ErrorReserva extends Error {
  constructor(mensaje: string, public readonly estado: number = 400, public readonly datos?: unknown) {
    super(mensaje);
  }
}

// Una pieza cambió de lugar entre que se eligió y que se intentó mover.
class ConflictoPiezas extends Error {}

function esConflicto(error: unknown): boolean {
  return (
    error instanceof ConflictoPiezas ||
    // P2034: la base de datos abortó la transacción por un choque con otra concurrente.
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
  );
}

function mensajeFaltantes(p: PropuestaArmado): string {
  const detalle = p.faltantes.map((f) => f.motivo).join(" ");
  return `No se puede armar el disfraz «${p.receta.nombre}» con esas tallas ahora mismo. ${detalle}`.trim();
}

async function aplicarReserva(
  usuarioId: string,
  receta: { id: string; nombre: string; precioDia: Prisma.Decimal },
  propuesta: PropuestaArmado,
  tallas: TallasPedido,
  peticion?: string
) {
  const id = randomUUID();
  const nombre = `${receta.nombre} a medida #${id.slice(0, 4).toUpperCase()}`;
  const vence = new Date(Date.now() + MINUTOS_RESERVA_INICIAL * 60_000);
  const donantes = Array.from(new Set(propuesta.piezas.filter((p) => p.origen === "DISFRAZ").map((p) => p.disfrazOrigenId)));

  return prisma.$transaction(
    async (tx) => {
      // Un disfraz que se alquiló entre la propuesta y ahora ya no puede prestar piezas.
      if (donantes.length > 0) {
        const ocupados = await tx.alquilerDisfraz.count({
          where: {
            disfrazFisicoId: { in: donantes },
            alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } },
          },
        });
        if (ocupados > 0) throw new ConflictoPiezas();
      }

      await tx.disfrazFisico.create({
        data: {
          id,
          nombre,
          tipoDisfraz: "A medida",
          temporadaEvento: "a-medida",
          precioAlquiler: receta.precioDia,
          origen: "A_MEDIDA",
        },
      });

      const reserva = await tx.reserva.create({
        data: {
          tipo: "A_MEDIDA",
          usuarioId,
          disfrazFisicoId: id,
          recetaId: receta.id,
          peticion: peticion ?? null,
          tallaRopa: tallas.ropa ?? null,
          tallaCalzado: tallas.calzado ?? null,
          vence,
        },
      });

      let orden = 0;
      for (const p of propuesta.piezas) {
        // La pieza solo se mueve si SIGUE donde y como la vio el motor.
        const movida = await tx.prenda.updateMany({
          where: { id: p.prendaId, disfrazActualId: p.disfrazOrigenId, estado: "DISPONIBLE" },
          data: { disfrazActualId: id },
        });
        if (movida.count !== 1) throw new ConflictoPiezas(); // la transacción entera se deshace

        await tx.movimientoPrenda.create({
          data: { reservaId: reserva.id, prendaId: p.prendaId, desdeId: p.disfrazOrigenId, haciaId: id, orden: orden++ },
        });
      }

      return { reservaId: reserva.id, disfrazId: id, nombre, vence };
    },
    { timeout: 10_000 }
  );
}

// Arma un disfraz a medida y aparta sus piezas. Lanza ErrorReserva (con `datos.faltantes`
// cuando no se puede completar) o ErrorArmado (tallas inválidas, receta inexistente).
export async function reservarAMedida(usuarioId: string, recetaId: string, tallas: TallasPedido, peticion?: string) {
  await liberarReservasVencidas();

  const activas = await prisma.reserva.count({ where: { usuarioId, liberadaEn: null, confirmadaEn: null } });
  if (activas >= MAX_RESERVAS_SIN_PAGAR) {
    throw new ErrorReserva(
      `Ya tienes ${activas} disfraces a medida reservados sin pagar. Paga o cancela alguno antes de armar otro.`,
      409
    );
  }

  const receta = await prisma.receta.findUnique({ where: { id: recetaId } });
  if (!receta || !receta.activa) throw new ErrorReserva("Esta receta no está disponible.", 404);

  for (let intento = 1; intento <= INTENTOS; intento++) {
    const propuesta = await proponerArmado(recetaId, tallas);
    if (!propuesta.completo) {
      throw new ErrorReserva(mensajeFaltantes(propuesta), 409, { faltantes: propuesta.faltantes });
    }

    try {
      const creada = await aplicarReserva(usuarioId, receta, propuesta, tallas, peticion);
      return { ...creada, propuesta };
    } catch (error) {
      // Otra persona se llevó una de las piezas justo antes: se vuelve a calcular.
      if (esConflicto(error) && intento < INTENTOS) continue;
      if (esConflicto(error)) {
        throw new ErrorReserva("Alguien reservó las mismas piezas al mismo tiempo. Intenta de nuevo en unos segundos.", 409);
      }
      throw error;
    }
  }

  throw new ErrorReserva("No se pudo reservar el disfraz. Intenta de nuevo.", 409);
}

// Amplía el plazo al iniciar el pago. Solo si la reserva sigue vigente.
export async function extenderReserva(reservaId: string, usuarioId: string, minutos: number = MINUTOS_RESERVA_PAGO) {
  const vence = new Date(Date.now() + minutos * 60_000);
  const r = await prisma.reserva.updateMany({
    where: { id: reservaId, usuarioId, liberadaEn: null, confirmadaEn: null, vence: { gt: new Date() } },
    data: { vence },
  });
  if (r.count === 0) throw new ErrorReserva("La reserva ya no está activa. Arma el disfraz de nuevo.", 409);
  return vence;
}

// Confirma la reserva (el pago se completó). No exige que el plazo siga vigente: mientras las
// piezas no se hayan liberado, un pago ya hecho debe poder confirmarse. Es idempotente.
export async function confirmarReserva(reservaId: string, usuarioId: string) {
  const r = await prisma.reserva.updateMany({
    where: { id: reservaId, usuarioId, liberadaEn: null, confirmadaEn: null },
    data: { confirmadaEn: new Date() },
  });
  if (r.count === 1) return;

  const yaConfirmada = await prisma.reserva.findFirst({
    where: { id: reservaId, usuarioId, confirmadaEn: { not: null } },
    select: { id: true },
  });
  if (!yaConfirmada) throw new ErrorReserva("La reserva ya no está activa: venció o fue cancelada.", 409);
}

export async function cancelarReserva(reservaId: string, usuarioId: string) {
  const liberada = await liberarSinConfirmar(reservaId, usuarioId);
  if (!liberada) throw new ErrorReserva("No hay una reserva sin pagar con ese identificador.", 404);
}

// Reservas sin pagar de una persona, con las piezas de cada disfraz.
export async function listarReservasActivas(usuarioId: string) {
  await liberarReservasVencidas();

  const reservas = await prisma.reserva.findMany({
    where: { usuarioId, liberadaEn: null, confirmadaEn: null },
    include: {
      receta: { select: { nombre: true } },
      disfrazFisico: {
        select: {
          id: true,
          nombre: true,
          precioAlquiler: true,
          prendasActuales: { select: { id: true, nombre: true, tipo: true, color: true, talla: true } },
        },
      },
    },
    orderBy: { creadoEn: "desc" },
  });

  return reservas.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    vence: r.vence,
    segundosRestantes: Math.max(0, Math.round((r.vence.getTime() - Date.now()) / 1000)),
    receta: r.receta?.nombre ?? null,
    disfraz: r.disfrazFisico,
  }));
}