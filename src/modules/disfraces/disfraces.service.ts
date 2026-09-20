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

type EstadoCalculado = "DISPONIBLE" | "INCOMPLETO" | "ALQUILADO" | "EN_REPARACION" | "SUSPENDIDO";

function contarFaltantes(disfraz: {
  prendasHogar: { tipo: string }[];
  prendasActuales: { tipo: string; estado: string }[];
}) {
  const requeridos: Record<string, number> = {};
  for (const p of disfraz.prendasHogar) requeridos[p.tipo] = (requeridos[p.tipo] || 0) + 1;
  const disponibles: Record<string, number> = {};
  for (const p of disfraz.prendasActuales) {
    if (p.estado === "DISPONIBLE") disponibles[p.tipo] = (disponibles[p.tipo] || 0) + 1;
  }
  let faltan = 0;
  for (const [tipo, cantidad] of Object.entries(requeridos)) {
    faltan += Math.max(0, cantidad - (disponibles[tipo] || 0));
  }
  return faltan;
}

async function calcularEstado(
  disfraz: {
    id: string;
    estadoManual: string | null;
    prendasHogar: { tipo: string }[];
    prendasActuales: { tipo: string; estado: string }[];
  },
  disfracesAlquiladosAhora: Set<string>
): Promise<EstadoCalculado> {
  if (disfraz.estadoManual === "EN_REPARACION") return "EN_REPARACION";
  if (disfraz.estadoManual === "SUSPENDIDO") return "SUSPENDIDO";
  if (disfracesAlquiladosAhora.has(disfraz.id)) return "ALQUILADO";
  if (contarFaltantes(disfraz) > 0) return "INCOMPLETO";
  return "DISPONIBLE";
}

async function obtenerAlquiladosAhoraIds(): Promise<Set<string>> {
  const filas = await prisma.alquilerDisfraz.findMany({
    where: { alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } } },
    select: { disfrazFisicoId: true },
  });
  return new Set(filas.map((f: { disfrazFisicoId: string }) => f.disfrazFisicoId));
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

  const alquiladosAhora = await obtenerAlquiladosAhoraIds();

  return Promise.all(
    disfraces.map(async (d: any) => ({
      ...d,
      estado: await calcularEstado(d, alquiladosAhora),
      faltantes: contarFaltantes(d),
      completo: contarFaltantes(d) === 0,
    }))
  );
}

export async function obtenerDisfrazConEstado(id: string) {
  const d = await prisma.disfrazFisico.findUnique({
    where: { id },
    include: { prendasHogar: true, prendasActuales: true },
  });
  if (!d) return null;
  const alquiladosAhora = await obtenerAlquiladosAhoraIds();
  return {
    ...d,
    estado: await calcularEstado(d, alquiladosAhora),
    faltantes: contarFaltantes(d),
    completo: contarFaltantes(d) === 0,
  };
}

export async function obtenerTemporadasDisponibles() {
  const filas = await prisma.disfrazFisico.findMany({ select: { temporadaEvento: true }, distinct: ["temporadaEvento"] });
  return filas.map((f: { temporadaEvento: string }) => f.temporadaEvento);
}

export async function obtenerTiposDisponibles() {
  const filas = await prisma.disfrazFisico.findMany({ select: { tipoDisfraz: true }, distinct: ["tipoDisfraz"] });
  return filas.map((f: { tipoDisfraz: string }) => f.tipoDisfraz);
}

export function actualizarEstadoManual(id: string, estado: "EN_REPARACION" | "SUSPENDIDO" | null) {
  return prisma.disfrazFisico.update({ where: { id }, data: { estadoManual: estado } });
}

export function actualizarPrenda(id: string, datos: { estado?: "DISPONIBLE" | "DANADA" | "FALTANTE"; calidad?: string }) {
  return prisma.prenda.update({ where: { id }, data: datos });
}

export async function buscarCandidatos(prendaId: string) {
  const prenda = await prisma.prenda.findUnique({ where: { id: prendaId } });
  if (!prenda) throw new Error("Prenda no encontrada");

  const candidatas = await prisma.prenda.findMany({
    where: { tipo: prenda.tipo, estado: "DISPONIBLE", id: { not: prendaId } },
    include: { disfrazHogar: true },
  });
  const enCasa = candidatas.filter((p: any) => p.disfrazActualId === p.disfrazHogarId);

  const alquiladosAhora = await obtenerAlquiladosAhoraIds();

  return enCasa
    .map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      calidad: p.calidad,
      color: p.color,
      talla: p.talla,
      disfrazOrigenId: p.disfrazHogarId,
      disfrazOrigenNombre: p.disfrazHogar.nombre,
      disfrazOrigenAlquilado: alquiladosAhora.has(p.disfrazHogarId),
    }))
    .sort((a: any, b: any) => Number(a.disfrazOrigenAlquilado) - Number(b.disfrazOrigenAlquilado));
}

export async function confirmarPrestamo(prendaNecesitadaId: string, prendaDonanteId: string) {
  const prendaNecesitada = await prisma.prenda.findUnique({ where: { id: prendaNecesitadaId } });
  if (!prendaNecesitada) throw new Error("Prenda no encontrada");

  const donante = await prisma.prenda.update({
    where: { id: prendaDonanteId },
    data: { disfrazActualId: prendaNecesitada.disfrazHogarId },
  });

  const disfrazDestino = await prisma.disfrazFisico.findUnique({ where: { id: prendaNecesitada.disfrazHogarId } });

  await prisma.sustitucion.create({
    data: {
      prendaId: donante.id,
      disfrazOrigenId: donante.disfrazHogarId,
      disfrazDestinoId: prendaNecesitada.disfrazHogarId,
      motivo: `Préstamo manual: ${donante.nombre} → ${disfrazDestino?.nombre}`,
    },
  });

  return donante;
}