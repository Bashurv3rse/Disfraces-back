import { prisma } from "../../config/prisma";
import { CrearPiezaInput } from "./catalogo.schema";

export function crearPieza(datos: CrearPiezaInput) {
  return prisma.pieza.create({ data: datos as any });
}

interface FiltrosPieza {
  nombre?: string;
  tipos?: string[];
  temporadas?: string[];
  colores?: string[];
}

export function listarPiezas(filtros: FiltrosPieza) {
  return prisma.pieza.findMany({
    where: {
      ...(filtros.nombre && { nombre: { contains: filtros.nombre, mode: "insensitive" } }),
      ...(filtros.tipos?.length && { tipo: { in: filtros.tipos as any } }),
      ...(filtros.temporadas?.length && {
        temporadaOriginal: { in: filtros.temporadas, mode: "insensitive" },
      }),
      ...(filtros.colores?.length && { coloresDisponibles: { hasSome: filtros.colores } }),
    },
    orderBy: { creadoEn: "desc" },
  });
}

export function obtenerPiezaPorId(id: string) {
  return prisma.pieza.findUnique({ where: { id } });
}

export function actualizarStock(id: string, stock: number) {
  return prisma.pieza.update({ where: { id }, data: { stock } });
}

export async function obtenerTemporadasDisponibles() {
  const filas = await prisma.pieza.findMany({
    select: { temporadaOriginal: true },
    distinct: ["temporadaOriginal"],
  });
  return filas.map((f: { temporadaOriginal: string }) => f.temporadaOriginal);
}