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
type FaseLavado = "LAVADO" | "PLANCHADO" | "EMPAQUETADO" | null;

// --- Días hábiles (lunes a viernes) transcurridos desde una fecha hasta hoy ---
function diasHabilesTranscurridos(desde: Date, hasta: Date): number {
  const inicio = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate()));
  let contador = 0;
  const cursor = new Date(inicio);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= fin) {
    const dia = cursor.getUTCDay();
    if (dia !== 0 && dia !== 6) contador++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return contador;
}

function faseLavadoPorDias(diasTranscurridos: number): FaseLavado {
  if (diasTranscurridos === 0) return "LAVADO";
  if (diasTranscurridos === 1) return "PLANCHADO";
  if (diasTranscurridos === 2) return "EMPAQUETADO";
  return null; // 3+ días hábiles: el ciclo terminó
}

// Libera automáticamente los disfraces cuyo ciclo de lavado (3 días hábiles) ya
// terminó — sincronizado con el reloj real, sin necesidad de que el admin lo confirme.
async function limpiarSuspensionesVencidas() {
  const suspendidos = await prisma.disfrazFisico.findMany({
    where: { estadoManual: "SUSPENDIDO", fechaSuspension: { not: null } },
    select: { id: true, fechaSuspension: true },
  });
  const ahora = new Date();
  const vencidosIds = suspendidos
    .filter((d: { fechaSuspension: Date | null }) => diasHabilesTranscurridos(d.fechaSuspension!, ahora) >= 3)
    .map((d: { id: string }) => d.id);

  if (vencidosIds.length > 0) {
    await prisma.disfrazFisico.updateMany({
      where: { id: { in: vencidosIds } },
      data: { estadoManual: null, fechaSuspension: null },
    });
  }
}

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

// Prendas que pertenecen "de casa" a este disfraz pero ahora completan otro
// (fueron prestadas) — es la alerta de "a este disfraz se le usó una pieza".
function contarPrestamosSalientes(disfraz: { id: string; prendasHogar: { disfrazActualId: string }[] }) {
  return disfraz.prendasHogar.filter((p) => p.disfrazActualId !== disfraz.id).length;
}

function calcularEstado(
  disfraz: {
    id: string;
    estadoManual: string | null;
    fechaSuspension: Date | null;
    prendasHogar: { tipo: string }[];
    prendasActuales: { tipo: string; estado: string }[];
  },
  disfracesAlquiladosAhora: Set<string>
): { estado: EstadoCalculado; faseLavado: FaseLavado } {
  if (disfraz.estadoManual === "EN_REPARACION") return { estado: "EN_REPARACION", faseLavado: null };
  if (disfraz.estadoManual === "SUSPENDIDO" && disfraz.fechaSuspension) {
    const dias = diasHabilesTranscurridos(disfraz.fechaSuspension, new Date());
    const fase = faseLavadoPorDias(dias);
    if (fase) return { estado: "SUSPENDIDO", faseLavado: fase };
    // Si ya pasaron los 3 días hábiles, limpiarSuspensionesVencidas() ya lo habrá
    // liberado antes de llegar aquí — este caso es solo un respaldo.
  }
  if (disfracesAlquiladosAhora.has(disfraz.id)) return { estado: "ALQUILADO", faseLavado: null };
  if (contarFaltantes(disfraz) > 0) return { estado: "INCOMPLETO", faseLavado: null };
  return { estado: "DISPONIBLE", faseLavado: null };
}

async function obtenerAlquiladosAhoraIds(): Promise<Set<string>> {
  // Un disfraz sigue "alquilado" mientras el alquiler no se cierre con una
  // devolución — aunque ya haya pasado la fecha de fin, permanece bloqueado.
  const filas = await prisma.alquilerDisfraz.findMany({
    where: { alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } } },
    select: { disfrazFisicoId: true },
  });
  return new Set(filas.map((f: { disfrazFisicoId: string }) => f.disfrazFisicoId));
}

async function estaAlquiladoAhora(disfrazId: string): Promise<boolean> {
  const ids = await obtenerAlquiladosAhoraIds();
  return ids.has(disfrazId);
}

export async function listarDisfraces(filtros: FiltrosDisfraz) {
  await limpiarSuspensionesVencidas();

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

  return disfraces.map((d: any) => {
    const { estado, faseLavado } = calcularEstado(d, alquiladosAhora);
    return {
      ...d,
      estado,
      faseLavado,
      faltantes: contarFaltantes(d),
      completo: contarFaltantes(d) === 0,
      prestamosSalientes: contarPrestamosSalientes(d),
    };
  });
}

export async function obtenerDisfrazConEstado(id: string) {
  await limpiarSuspensionesVencidas();

  const d = await prisma.disfrazFisico.findUnique({
    where: { id },
    include: { prendasHogar: true, prendasActuales: true },
  });
  if (!d) return null;
  const alquiladosAhora = await obtenerAlquiladosAhoraIds();
  const { estado, faseLavado } = calcularEstado(d, alquiladosAhora);
  return {
    ...d,
    estado,
    faseLavado,
    faltantes: contarFaltantes(d),
    completo: contarFaltantes(d) === 0,
    prestamosSalientes: contarPrestamosSalientes(d),
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

// --- Gestión manual del inventario físico (admin) ---
// Todas bloqueadas mientras el disfraz esté alquilado — ni el admin puede tocarlo
// hasta que el cliente lo devuelva.

export async function actualizarEstadoManual(id: string, estado: "EN_REPARACION" | "SUSPENDIDO" | null) {
  if (await estaAlquiladoAhora(id)) throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  return prisma.disfrazFisico.update({ where: { id }, data: { estadoManual: estado } });
}

export async function actualizarPrenda(id: string, datos: { estado?: "DISPONIBLE" | "DANADA" | "FALTANTE"; calidad?: string }) {
  const prenda = await prisma.prenda.findUnique({ where: { id } });
  if (!prenda) throw new Error("Prenda no encontrada");
  if (await estaAlquiladoAhora(prenda.disfrazHogarId)) {
    throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  }
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
  if (await estaAlquiladoAhora(prendaNecesitada.disfrazHogarId)) {
    throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  }

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