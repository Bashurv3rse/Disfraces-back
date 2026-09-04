import { prisma } from "../../config/prisma";
import { CrearAlquilerInput } from "./alquileres.schema";

interface PiezaResumen {
  id: string;
  precioAlquiler: unknown;
}

export async function crearAlquiler(datos: CrearAlquilerInput, usuarioId: string) {
  const piezas = await prisma.pieza.findMany({ where: { id: { in: datos.piezaIds } } });
  const montoTotal = piezas.reduce((suma: number, p: PiezaResumen) => suma + Number(p.precioAlquiler), 0);

  return prisma.alquiler.create({
    data: {
      usuarioId,
      fechaInicio: new Date(datos.fechaInicio),
      fechaFin: new Date(datos.fechaFin),
      evento: datos.evento,
      montoTotal,
      piezas: {
        create: piezas.map((p: PiezaResumen) => ({ piezaId: p.id, precioUnitario: p.precioAlquiler as any })),
      },
    },
    include: { piezas: { include: { pieza: true } } },
  });
}

export function listarPropios(usuarioId: string) {
  return prisma.alquiler.findMany({
    where: { usuarioId },
    include: { piezas: { include: { pieza: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export function listarTodos() {
  return prisma.alquiler.findMany({
    include: { piezas: { include: { pieza: true } }, usuario: { select: { nombre: true, email: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export async function eliminarAlquiler(id: string, usuarioId: string) {
  await prisma.alquilerPieza.deleteMany({ where: { alquilerId: id } });
  return prisma.alquiler.deleteMany({ where: { id, usuarioId } });
}

export async function resumenAdmin() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [totalAlquileres, alquileresActivos, alquileresDelMes, ultimos] = await Promise.all([
    prisma.alquiler.count(),
    prisma.alquiler.count({ where: { estado: "ACTIVO" } }),
    prisma.alquiler.findMany({ where: { creadoEn: { gte: inicioMes } }, select: { montoTotal: true } }),
    prisma.alquiler.findMany({
      take: 5,
      orderBy: { creadoEn: "desc" },
      include: { usuario: { select: { nombre: true } } },
    }),
  ]);

  const ingresosMes = alquileresDelMes.reduce(
    (s: number, a: { montoTotal: unknown }) => s + Number(a.montoTotal),
    0
  );

  return {
    totalAlquileres,
    alquileresActivos,
    ingresosMes,
    ultimosAlquileres: ultimos.map((a: any) => ({
      cliente: a.usuario.nombre,
      monto: Number(a.montoTotal),
      estado: a.estado === "ACTIVO" ? "activo" : "completado",
    })),
  };
}