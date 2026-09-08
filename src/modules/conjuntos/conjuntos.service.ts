import { prisma } from "../../config/prisma";
import { CrearConjuntoInput } from "./conjuntos.schema";

export async function crearConjunto(datos: CrearConjuntoInput, creadoPorId?: string) {
  return prisma.conjunto.create({
    data: {
      nombre: datos.nombre,
      tipo: datos.tipo,
      temporadaEvento: datos.temporadaEvento,
      creadoPorId: datos.tipo === "PERSONALIZADO" ? creadoPorId : undefined,
      piezas: {
        create: datos.piezaIds.map((piezaId) => ({ piezaId })),
      },
    },
    include: { piezas: { include: { pieza: true } } },
  });
}

interface FiltrosConjunto {
  tipo?: string;
  temporadaEvento?: string;
}

export function listarConjuntos(filtros: FiltrosConjunto) {
  return prisma.conjunto.findMany({
    where: {
      ...(filtros.tipo && { tipo: filtros.tipo as any }),
      ...(filtros.temporadaEvento && {
        temporadaEvento: { equals: filtros.temporadaEvento, mode: "insensitive" },
      }),
    },
    include: { piezas: { include: { pieza: true } } },
    orderBy: { creadoEn: "desc" },
  });
}