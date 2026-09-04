import { prisma } from "../../config/prisma";
import { CrearDevolucionInput } from "./devoluciones.schema";

export async function crearDevolucion(datos: CrearDevolucionInput, usuarioId: string) {
  const alquiler = await prisma.alquiler.findFirst({ where: { id: datos.alquilerId, usuarioId } });
  if (!alquiler) {
    throw new Error("Alquiler no encontrado");
  }

  const devolucion = await prisma.devolucion.create({
    data: {
      alquilerId: datos.alquilerId,
      fechaDevolucion: new Date(datos.fechaDevolucion),
      observaciones: datos.observaciones,
    },
  });

  await prisma.alquiler.update({ where: { id: datos.alquilerId }, data: { estado: "FINALIZADO" } });

  return devolucion;
}

export function listarDevoluciones() {
  return prisma.devolucion.findMany({
    include: {
      alquiler: {
        include: {
          usuario: { select: { nombre: true, email: true } },
          piezas: { include: { pieza: true } },
        },
      },
    },
    orderBy: { creadoEn: "desc" },
  });
}

export function actualizarEstadoDevolucion(id: string, estado: "APROBADA" | "RECHAZADA" | "CON_OBSERVACIONES") {
  return prisma.devolucion.update({ where: { id }, data: { estado } });
}

export function contarPendientes() {
  return prisma.devolucion.count({ where: { estado: "PENDIENTE" } });
}