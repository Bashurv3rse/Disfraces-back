import { prisma } from "../../config/prisma";
import { CrearProveedorInput } from "./proveedores.schema";

export function crearProveedor(datos: CrearProveedorInput) {
  return prisma.proveedor.create({ data: datos });
}

export function listarProveedores() {
  return prisma.proveedor.findMany({
    include: { piezas: { include: { pieza: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export function asociarPieza(proveedorId: string, piezaId: string) {
  return prisma.piezaProveedor.create({
    data: { proveedorId, piezaId },
    include: { pieza: true, proveedor: true },
  });
}