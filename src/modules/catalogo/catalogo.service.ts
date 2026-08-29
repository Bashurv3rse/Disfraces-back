import { prisma } from "../../config/prisma";
import { CrearPiezaInput } from "./catalogo.schema";

export function crearPieza(datos: CrearPiezaInput) {
  return prisma.pieza.create({ data: datos });
}
export function listarPiezas() {
  return prisma.pieza.findMany({ orderBy: { creadoEn: "desc" } });
}

export function obtenerPiezaPorId(id: string) {
  return prisma.pieza.findUnique({ where: { id } });
}

export function actualizarStock(id: string, stock: number) {
  return prisma.pieza.update({ where: { id }, data: { stock } });
}