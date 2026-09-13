import { prisma } from "../../config/prisma";
import { CrearDisfrazInput } from "./disfraces.schema";

export async function crearDisfraz(datos: CrearDisfrazInput) {
  const disfraz = await prisma.disfrazFisico.create({
    data: {
      nombre: datos.nombre,
      tipoDisfraz: datos.tipoDisfraz,
      temporadaEvento: datos.temporadaEvento,
      precioAlquiler: datos.precioAlquiler,
    },
  });

  await prisma.prenda.createMany({
    data: datos.prendas.map((p) => ({
      nombre: p.nombre,
      tipo: p.tipo as any,
      color: p.color,
      talla: p.talla,
      disfrazHogarId: disfraz.id,
      disfrazActualId: disfraz.id,
    })),
  });

  return obtenerDisfrazConEstado(disfraz.id);
}

interface FiltrosDisfraz {
  nombre?: string;
  temporadas?: string[];
  tipos?: string[];
}

function calcularCompleto(disfraz: {
  prendasHogar: { tipo: string }[];
  prendasActuales: { tipo: string; estado: string }[];
}) {
  const requeridos: Record<string, number> = {};
  for (const p of disfraz.prendasHogar) {
    requeridos[p.tipo] = (requeridos[p.tipo] || 0) + 1;
  }
  const disponibles: Record<string, number> = {};
  for (const p of disfraz.prendasActuales) {
    if (p.estado === "DISPONIBLE") disponibles[p.tipo] = (disponibles[p.tipo] || 0) + 1;
  }
  return Object.entries(requeridos).every(([tipo, cantidad]) => (disponibles[tipo] || 0) >= cantidad);
}

export async function listarDisfraces(filtros: FiltrosDisfraz) {
  const disfraces = await prisma.disfrazFisico.findMany({
    where: {
      ...(filtros.nombre && { nombre: { contains: filtros.nombre, mode: "insensitive" } }),
      ...(filtros.temporadas?.length && { temporadaEvento: { in: filtros.temporadas, mode: "insensitive" } }),
      ...(filtros.tipos?.length && { tipoDisfraz: { in: filtros.tipos, mode: "insensitive" } }),
    },
    include: { prendasHogar: true, prendasActuales: true },
    orderBy: { creadoEn: "desc" },
  });

  return disfraces.map((d: any) => ({
    ...d,
    completo: calcularCompleto(d),
  }));
}

export async function obtenerDisfrazConEstado(id: string) {
  const d = await prisma.disfrazFisico.findUnique({
    where: { id },
    include: { prendasHogar: true, prendasActuales: true },
  });
  if (!d) return null;
  return { ...d, completo: calcularCompleto(d) };
}

export async function obtenerTemporadasDisponibles() {
  const filas = await prisma.disfrazFisico.findMany({
    select: { temporadaEvento: true },
    distinct: ["temporadaEvento"],
  });
  return filas.map((f: { temporadaEvento: string }) => f.temporadaEvento);
}

export async function obtenerTiposDisponibles() {
  const filas = await prisma.disfrazFisico.findMany({
    select: { tipoDisfraz: true },
    distinct: ["tipoDisfraz"],
  });
  return filas.map((f: { tipoDisfraz: string }) => f.tipoDisfraz);
}