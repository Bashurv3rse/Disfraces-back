import { prisma } from "../../config/prisma";
import { CrearPiezaInput } from "./catalogo.schema";

export function crearPieza(datos: CrearPiezaInput) {
  return prisma.pieza.create({ data: datos });
}
interface FiltrosPieza {
  tipo?: string;
  tallaEEUU?: string;
  color?: string;
  temporadaOriginal?: string;
  modelo?: string;
}

export function listarPiezas(filtros: FiltrosPieza) {
  return prisma.pieza.findMany({
    where: {
      ...(filtros.tipo && { tipo: filtros.tipo as any }),
      ...(filtros.tallaEEUU && { tallaEEUU: filtros.tallaEEUU }),
      ...(filtros.color && { color: { equals: filtros.color, mode: "insensitive" } }),
      ...(filtros.temporadaOriginal && { temporadaOriginal: { equals: filtros.temporadaOriginal, mode: "insensitive" } }),
      ...(filtros.modelo && { modelo: { equals: filtros.modelo, mode: "insensitive" } }),
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