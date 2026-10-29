import { prisma } from "../../config/prisma";
import { CrearProveedorInput } from "./proveedores.schema";

export function crearProveedor(datos: CrearProveedorInput) {
  return prisma.proveedor.create({ data: datos });
}

export function listarProveedores() {
  return prisma.proveedor.findMany({
    include: { prendas: { include: { prenda: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export function asociarPrenda(proveedorId: string, prendaId: string) {
  return prisma.prendaProveedor.create({
    data: { proveedorId, prendaId },
    include: { prenda: true, proveedor: true },
  });
}