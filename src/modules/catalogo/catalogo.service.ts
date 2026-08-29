import { prisma } from "../../config/prisma";
import { CrearPiezaInput } from "./catalogo.schema";

export function crearPieza(datos: CrearPiezaInput) {
  return prisma.pieza.create({ data: datos });
}