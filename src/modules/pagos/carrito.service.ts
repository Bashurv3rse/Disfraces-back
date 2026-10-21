import { prisma } from "../../config/prisma";
import { ErrorCotizacion } from "./precios.service";
import { liberarReservasVencidas } from "../a-medida/reservas.base";
import { extenderReserva } from "../a-medida/reservas.service";

export interface ReservaCarrito {
  reservaId: string;
  disfrazId: string;
  tipo: string;
  vence: Date;
  segundosRestantes: number;
}

// Comprueba que todo lo que hay en el carrito se puede comprar ahora y devuelve las reservas
// sin pagar de esta persona (disfraces a medida o con tallas ajustadas). Lanza ErrorCotizacion
// con un mensaje claro, siempre con estado 400, 404 o 409, nunca 401.
export async function prepararCarrito(ids: string[], usuarioId: string): Promise<{ reservas: ReservaCarrito[] }> {
  // Libera primero las reservas vencidas: si la del cliente venció, que se entere ahora y no al pagar.
  await liberarReservasVencidas();

  const disfraces = await prisma.disfrazFisico.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, origen: true },
  });

  if (disfraces.length !== new Set(ids).size) {
    throw new ErrorCotizacion(
      "Alguno de los disfraces del carrito ya no está disponible. Si era un disfraz a medida, su reserva pudo vencer. Quítalo del carrito para continuar.",
      409
    );
  }

  // El almacén es un «disfraz» interno que guarda piezas sueltas: nunca se vende.
  if (disfraces.some((d) => d.origen === "ALMACEN")) {
    throw new ErrorCotizacion("Hay un artículo en el carrito que no se puede alquilar. Quítalo para continuar.", 400);
  }

  const reservas = await prisma.reserva.findMany({
    where: {
      disfrazFisicoId: { in: ids },
      usuarioId,
      liberadaEn: null,
      confirmadaEn: null,
      vence: { gt: new Date() },
    },
    select: { id: true, tipo: true, disfrazFisicoId: true, vence: true },
  });

  // Un disfraz a medida solo se puede pagar con una reserva vigente A NOMBRE DE QUIEN PAGA.
  for (const d of disfraces) {
    if (d.origen !== "A_MEDIDA") continue;
    const suya = reservas.find((r) => r.disfrazFisicoId === d.id && r.tipo === "A_MEDIDA");
    if (!suya) {
      throw new ErrorCotizacion(
        `«${d.nombre}» ya no está reservado a tu nombre: la reserva venció, se canceló o ya se pagó. Quítalo del carrito para continuar.`,
        409
      );
    }
  }

  const ahora = Date.now();
  return {
    reservas: reservas.map((r) => ({
      reservaId: r.id,
      disfrazId: r.disfrazFisicoId,
      tipo: r.tipo as string,
      vence: r.vence,
      segundosRestantes: Math.max(0, Math.round((r.vence.getTime() - ahora) / 1000)),
    })),
  };
}

// Al iniciar el pago, las reservas pasan al plazo largo (45 min).
export async function extenderReservasDelCarrito(reservas: ReservaCarrito[], usuarioId: string) {
  for (const r of reservas) {
    await extenderReserva(r.reservaId, usuarioId);
  }
}

// Para el alquiler directo del admin: solo disfraces del catálogo.
export async function validarSoloCatalogo(ids: string[]) {
  const disfraces = await prisma.disfrazFisico.findMany({
    where: { id: { in: ids } },
    select: { id: true, origen: true },
  });
  if (disfraces.length !== new Set(ids).size) {
    throw new ErrorCotizacion("Alguno de los disfraces no existe.", 404);
  }
  if (disfraces.some((d) => d.origen !== "CATALOGO")) {
    throw new ErrorCotizacion("Solo se pueden alquilar directamente disfraces del catálogo.", 400);
  }
}