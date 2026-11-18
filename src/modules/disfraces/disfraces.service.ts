import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { CrearDisfrazInput } from "./disfraces.schema";
import { desarmarReservasTerminadas, liberarReservasVencidas, obtenerReservadosIds } from "../a-medida/reservas.base";
import type { RangoFechas } from "./rango";
import { etiquetaEstadoManual, etiquetaEstadoPrenda, registrarEventoDisfraz } from "./historial.service";

// Error de regla de negocio, con el código HTTP que debe devolver el controller.
export class ErrorDisfraz extends Error {
  constructor(mensaje: string, public readonly estado: number) {
    super(mensaje);
  }
}

function aSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function crearDisfraz(datos: CrearDisfrazInput) {
  const nombreRepetido = await prisma.disfrazFisico.findFirst({
    where: { nombre: { equals: datos.nombre, mode: "insensitive" } },
    select: { id: true },
  });
  if (nombreRepetido) {
    throw new ErrorDisfraz(`Ya existe un disfraz llamado "${datos.nombre}".`, 409);
  }

  // Familia: la indicada, o el nombre sin el sufijo "#N".
  const familiaSolicitada = datos.familia ?? (datos.nombre.replace(/\s*#\d+\s*$/, "").trim() || datos.nombre);

  // Si la familia ya existe, el nuevo disfraz respeta su escritura y su grupo.
  const hermano = await prisma.disfrazFisico.findFirst({
    where: { familia: { equals: familiaSolicitada, mode: "insensitive" } },
    select: { familia: true, grupoCompatibilidad: true },
  });

  if (
    hermano?.grupoCompatibilidad &&
    datos.grupoCompatibilidad &&
    hermano.grupoCompatibilidad !== datos.grupoCompatibilidad
  ) {
    throw new ErrorDisfraz(
      `La familia "${hermano.familia}" ya pertenece al grupo "${hermano.grupoCompatibilidad}"; no puede crearse en otro grupo.`,
      409
    );
  }

  const familia = hermano?.familia ?? familiaSolicitada;
  const grupo =
    datos.grupoCompatibilidad ??
    hermano?.grupoCompatibilidad ??
    (aSlug(familia) || `grupo-${randomUUID().slice(0, 8)}`);

  // Disfraz y prendas en una sola transacción: o se crea todo, o no se crea nada.
  const id = randomUUID();
  await prisma.$transaction([
    prisma.disfrazFisico.create({
      data: {
        id,
        nombre: datos.nombre,
        familia,
        grupoCompatibilidad: grupo,
        tipoDisfraz: datos.tipoDisfraz,
        temporadaEvento: datos.temporadaEvento,
        precioAlquiler: datos.precioAlquiler,
        imagenUrl: datos.imagenUrl,
      },
    }),
    prisma.prenda.createMany({
      data: datos.prendas.map((p) => ({
        nombre: p.nombre,
        tipo: p.tipo as any,
        color: p.color,
        talla: p.talla,
        disfrazHogarId: id,
        disfrazActualId: id,
      })),
    }),
  ]);

  return obtenerDisfrazConEstado(id);
}

interface FiltrosDisfraz {
  nombre?: string;
  temporadas?: string[];
  tipos?: string[];
}

interface OpcionesListado {
  // Rango de fechas para el que se quiere saber la disponibilidad (por defecto, hoy).
  rango?: RangoFechas;
  // Agrega a cada disfraz su disponibilidad en el rango y los días ocupados próximos.
  conDisponibilidad?: boolean;
}

type EstadoCalculado = "DISPONIBLE" | "INCOMPLETO" | "ALQUILADO" | "RESERVADO" | "EN_REPARACION" | "SUSPENDIDO";
export type FaseLavado = "LAVADO" | "PLANCHADO" | "EMPAQUETADO" | null;

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

// Días hábiles transcurridos del lavado y fase en la que va (la fase es null si ya terminó).
export function infoLavado(fechaSuspension: Date): { dias: number; fase: FaseLavado } {
  const dias = diasHabilesTranscurridos(fechaSuspension, new Date());
  return { dias, fase: faseLavadoPorDias(dias) };
}

// Fecha (UTC) en que se cumple el tercer día hábil y el disfraz sale del lavado.
export function fechaLiberacionLavado(desde: Date): Date {
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  let habiles = 0;
  while (habiles < 3) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dia = cursor.getUTCDay();
    if (dia !== 0 && dia !== 6) habiles++;
  }
  return cursor;
}

// Un disfraz está «en lavado» mientras dura su ciclo de 3 días hábiles tras una
// devolución. Usa la misma regla que calcularEstado, así que nunca se contradicen.
function estaEnLavado(d: { estadoManual: string | null; fechaSuspension: Date | null }): boolean {
  if (d.estadoManual !== "SUSPENDIDO" || !d.fechaSuspension) return false;
  return faseLavadoPorDias(diasHabilesTranscurridos(d.fechaSuspension, new Date())) !== null;
}

// --- Disponibilidad por fechas ---
// Un alquiler solo deja el disfraz fuera de circulación en SUS fechas (más los 3 días hábiles de
// lavado posteriores), no desde el momento en que se paga. Así un alquiler para dentro de una
// semana no bloquea fechas anteriores ni posteriores a ese tramo.

export type { RangoFechas };

export interface TramoOcupado {
  desde: Date; // primer día ocupado
  hasta: Date; // día en que vuelve a estar libre (no incluido)
}

function aDiaUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Tramo que ocupa un alquiler abierto. Si ya pasó su fecha de fin y no se devolvió, el disfraz
// sigue fuera hasta hoy (y luego pasa por el lavado).
export function tramoDeAlquiler(inicio: Date, fin: Date, hoy: Date = new Date()): TramoOcupado {
  const desde = aDiaUTC(inicio);
  const finEfectivo = new Date(Math.max(aDiaUTC(fin).getTime(), aDiaUTC(hoy).getTime()));
  return { desde, hasta: fechaLiberacionLavado(finEfectivo) };
}

// Dos tramos chocan si se superponen. El rango pedido incluye el lavado que tendrá el disfraz
// después de SU fin, para que el alquiler siguiente no lo reciba sin lavar.
export function chocaConTramo(rango: RangoFechas, tramo: TramoOcupado): boolean {
  return aDiaUTC(rango.inicio) < tramo.hasta && fechaLiberacionLavado(aDiaUTC(rango.fin)) > tramo.desde;
}

export interface AlquilerAbierto {
  disfrazFisicoId: string;
  alquiler?: { fechaInicio: Date; fechaFin: Date } | null;
}

// Alquileres sin devolución cerrada (activos o pendientes), con sus fechas.
async function obtenerTramosOcupados(hoy: Date = new Date()): Promise<Map<string, TramoOcupado[]>> {
  const filas: AlquilerAbierto[] = await prisma.alquilerDisfraz.findMany({
    where: { alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } } },
    select: { disfrazFisicoId: true, alquiler: { select: { fechaInicio: true, fechaFin: true } } },
  });
  const mapa = new Map<string, TramoOcupado[]>();
  for (const f of filas) {
    if (!f.alquiler) continue;
    const lista = mapa.get(f.disfrazFisicoId) ?? [];
    lista.push(tramoDeAlquiler(f.alquiler.fechaInicio, f.alquiler.fechaFin, hoy));
    mapa.set(f.disfrazFisicoId, lista);
  }
  return mapa;
}

// Estado del disfraz PARA UN RANGO de fechas. Las marcas físicas (reparación, incompleto) y las
// reservas vigentes de otras personas bloquean cualquier rango; el lavado en curso y los
// alquileres solo bloquean los días que realmente ocupan.
function calcularEstadoEnRango(
  disfraz: {
    id: string;
    estadoManual: string | null;
    fechaSuspension: Date | null;
    prendasHogar: { tipo: string }[];
    prendasActuales: { tipo: string; estado: string }[];
  },
  rango: RangoFechas,
  tramos: Map<string, TramoOcupado[]>,
  reservados: Set<string>
): EstadoCalculado {
  if (disfraz.estadoManual === "EN_REPARACION") return "EN_REPARACION";
  if (disfraz.estadoManual === "SUSPENDIDO" && disfraz.fechaSuspension) {
    const enLavado = faseLavadoPorDias(diasHabilesTranscurridos(disfraz.fechaSuspension, new Date())) !== null;
    if (enLavado && aDiaUTC(rango.inicio) < fechaLiberacionLavado(disfraz.fechaSuspension)) return "SUSPENDIDO";
  }
  if ((tramos.get(disfraz.id) ?? []).some((t) => chocaConTramo(rango, t))) return "ALQUILADO";
  if (reservados.has(disfraz.id)) return "RESERVADO";
  if (contarFaltantes(disfraz) > 0) return "INCOMPLETO";
  return "DISPONIBLE";
}

const diaIso = (d: Date) => d.toISOString().slice(0, 10);

// Días en los que NO se puede empezar un alquiler (para el calendario del cliente). Incluye los
// días previos a otro alquiler en los que el lavado posterior chocaría con él, y el lavado en
// curso tras una devolución. No trae datos de quién alquiló: es lo que puede ver cualquier cliente.
export function diasBloqueadosParaInicio(
  tramos: TramoOcupado[] | undefined,
  lavadoHasta: Date | null,
  hoy: Date
): { desde: string; hasta: string }[] {
  const hoyDia = aDiaUTC(hoy);
  const intervalos: { desde: Date; hasta: Date }[] = []; // hasta = último día bloqueado (incluido)

  for (const t of tramos ?? []) {
    if (t.hasta <= hoyDia) continue;
    // Primer día desde el que un alquiler empezaría y su lavado se cruzaría con este tramo.
    let primero = new Date(t.desde);
    for (let i = 0; i < 10; i++) {
      const anterior = new Date(primero.getTime() - 86_400_000);
      if (anterior < hoyDia || fechaLiberacionLavado(anterior) <= t.desde) break;
      primero = anterior;
    }
    intervalos.push({ desde: primero, hasta: new Date(t.hasta.getTime() - 86_400_000) });
  }
  if (lavadoHasta && lavadoHasta > hoyDia) {
    intervalos.push({ desde: hoyDia, hasta: new Date(lavadoHasta.getTime() - 86_400_000) });
  }

  intervalos.sort((a, b) => a.desde.getTime() - b.desde.getTime());
  const unidos: { desde: Date; hasta: Date }[] = [];
  for (const i of intervalos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && i.desde.getTime() <= ultimo.hasta.getTime() + 86_400_000) {
      if (i.hasta > ultimo.hasta) ultimo.hasta = i.hasta;
    } else {
      unidos.push({ ...i });
    }
  }
  return unidos.map((i) => ({ desde: diaIso(i.desde), hasta: diaIso(i.hasta) }));
}

// Marca física que impide alquilar en cualquier fecha (a diferencia del alquiler o el lavado,
// que solo ocupan unos días).
function bloqueoFisico(
  d: { estadoManual: string | null; prendasHogar: { tipo: string }[]; prendasActuales: { tipo: string; estado: string }[]; id: string },
  reservados: Set<string>
): "EN_REPARACION" | "RESERVADO" | "INCOMPLETO" | null {
  if (d.estadoManual === "EN_REPARACION") return "EN_REPARACION";
  if (reservados.has(d.id)) return "RESERVADO";
  if (contarFaltantes(d) > 0) return "INCOMPLETO";
  return null;
}

function lavadoHastaDe(d: { estadoManual: string | null; fechaSuspension: Date | null }): Date | null {
  if (d.estadoManual !== "SUSPENDIDO" || !d.fechaSuspension) return null;
  return fechaLiberacionLavado(d.fechaSuspension);
}

// Disponibilidad de varios disfraces para un rango (lo usa el carrito al elegir las fechas).
export async function disponibilidadDeDisfraces(ids: string[], rango: RangoFechas) {
  await limpiarSuspensionesVencidas();
  const disfraces = await prisma.disfrazFisico.findMany({
    where: { id: { in: ids } },
    include: { prendasHogar: true, prendasActuales: true },
  });
  const hoy = new Date();
  const [tramos, reservados] = await Promise.all([obtenerTramosOcupados(hoy), obtenerReservadosIds()]);
  return disfraces.map((d: any) => {
    const estado = calcularEstadoEnRango(d, rango, tramos, reservados);
    return {
      id: d.id as string,
      nombre: d.nombre as string,
      estado: estado as string,
      disponible: estado === "DISPONIBLE",
      bloqueo: bloqueoFisico(d, reservados),
      ocupaciones: diasBloqueadosParaInicio(tramos.get(d.id), lavadoHastaDe(d), hoy),
    };
  });
}

// Libera las reservas sin pagar que ya vencieron, termina el lavado de los disfraces que ya
// cumplieron sus 3 días hábiles y desarma los disfraces a medida que ya no están alquilados
// ni en lavado. Sincronizado con el reloj real y sin intervención del admin.
export async function limpiarSuspensionesVencidas() {
  await liberarReservasVencidas();

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

  await desarmarReservasTerminadas();
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

// Prendas que pertenecen «de casa» a este disfraz pero ahora completan otro
// (fueron prestadas): es la alerta de «a este disfraz se le usó una pieza».
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
  disfracesAlquiladosAhora: Set<string>,
  disfracesReservadosAhora: Set<string>
): { estado: EstadoCalculado; faseLavado: FaseLavado } {
  if (disfraz.estadoManual === "EN_REPARACION") return { estado: "EN_REPARACION", faseLavado: null };
  if (disfraz.estadoManual === "SUSPENDIDO" && disfraz.fechaSuspension) {
    const dias = diasHabilesTranscurridos(disfraz.fechaSuspension, new Date());
    const fase = faseLavadoPorDias(dias);
    if (fase) return { estado: "SUSPENDIDO", faseLavado: fase };
  }
  if (disfracesAlquiladosAhora.has(disfraz.id)) return { estado: "ALQUILADO", faseLavado: null };
  if (disfracesReservadosAhora.has(disfraz.id)) return { estado: "RESERVADO", faseLavado: null };
  if (contarFaltantes(disfraz) > 0) return { estado: "INCOMPLETO", faseLavado: null };
  return { estado: "DISPONIBLE", faseLavado: null };
}

async function obtenerAlquiladosAhoraIds(): Promise<Set<string>> {
  // Un disfraz sigue «alquilado» mientras el alquiler no se cierre con una
  // devolución, aunque ya haya pasado la fecha de fin.
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

// Una pieza que forma parte de una reserva viva (ajuste de talla o disfraz a medida) no se puede cambiar
// ni mover a mano: vuelve sola a su lugar cuando la reserva se deshace.
async function estaApartada(prendaId: string): Promise<boolean> {
  return (await prisma.movimientoPrenda.count({ where: { prendaId, reserva: { liberadaEn: null } } })) > 0;
}

export async function listarDisfraces(filtros: FiltrosDisfraz, opciones: OpcionesListado = {}) {
  await limpiarSuspensionesVencidas();

  const disfraces = await prisma.disfrazFisico.findMany({
    where: {
      origen: "CATALOGO",
      ...(filtros.nombre && { nombre: { contains: filtros.nombre, mode: "insensitive" } }),
      ...(filtros.temporadas?.length && { temporadaEvento: { in: filtros.temporadas, mode: "insensitive" } }),
      ...(filtros.tipos?.length && { tipoDisfraz: { in: filtros.tipos, mode: "insensitive" } }),
    },
    include: { prendasHogar: true, prendasActuales: true },
    orderBy: { creadoEn: "desc" },
  });

  const [alquiladosAhora, reservadosAhora] = await Promise.all([obtenerAlquiladosAhoraIds(), obtenerReservadosIds()]);

  const hoy = new Date();
  const rango = opciones.rango ?? { inicio: hoy, fin: hoy };
  const tramos = opciones.conDisponibilidad ? await obtenerTramosOcupados(hoy) : null;

  return disfraces.map((d: any) => {
    const { estado, faseLavado } = calcularEstado(d, alquiladosAhora, reservadosAhora);
    const base = {
      ...d,
      estado,
      faseLavado,
      faltantes: contarFaltantes(d),
      completo: contarFaltantes(d) === 0,
      prestamosSalientes: contarPrestamosSalientes(d),
    };
    if (!tramos) return base;

    const estadoEnRango = calcularEstadoEnRango(d, rango, tramos, reservadosAhora);
    return {
      ...base,
      // «estado» sigue siendo el estado de hoy (lo usa el inventario del administrador);
      // «disponibilidad» es lo que ve el cliente para SUS fechas.
      disponibilidad: { estado: estadoEnRango, disponible: estadoEnRango === "DISPONIBLE" },
      bloqueo: bloqueoFisico(d, reservadosAhora),
      ocupaciones: diasBloqueadosParaInicio(tramos.get(d.id), lavadoHastaDe(d), hoy),
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
  const [alquiladosAhora, reservadosAhora] = await Promise.all([obtenerAlquiladosAhoraIds(), obtenerReservadosIds()]);
  const { estado, faseLavado } = calcularEstado(d, alquiladosAhora, reservadosAhora);
  return {
    ...d,
    estado,
    faseLavado,
    faltantes: contarFaltantes(d),
    completo: contarFaltantes(d) === 0,
    prestamosSalientes: contarPrestamosSalientes(d),
  };
}

// Disfraces de una lista que NO se pueden alquilar ahora (alquilados, reservados por otra
// persona, incompletos, en lavado o en reparación). Es la misma regla que muestra el catálogo,
// pero comprobada en el servidor. La reserva de la propia persona no cuenta como ocupado.
// Si se indica un rango de fechas, un alquiler solo cuenta como «ocupado» cuando se cruza con ese
// rango; sin rango se mantiene la regla de «alquilado ahora» (alquiler sin devolución cerrada).
export async function disfracesNoDisponibles(ids: string[], usuarioId?: string, rango?: RangoFechas) {
  await limpiarSuspensionesVencidas();

  const disfraces = await prisma.disfrazFisico.findMany({
    where: { id: { in: ids } },
    include: { prendasHogar: true, prendasActuales: true },
  });
  if (rango) {
    const [tramos, reservadosRango] = await Promise.all([obtenerTramosOcupados(), obtenerReservadosIds(usuarioId)]);
    return disfraces
      .map((d: any) => ({
        id: d.id as string,
        nombre: d.nombre as string,
        estado: calcularEstadoEnRango(d, rango, tramos, reservadosRango) as string,
      }))
      .filter((d: { estado: string }) => d.estado !== "DISPONIBLE");
  }

  const [alquilados, reservados] = await Promise.all([obtenerAlquiladosAhoraIds(), obtenerReservadosIds(usuarioId)]);

  return disfraces
    .map((d: any) => ({
      id: d.id as string,
      nombre: d.nombre as string,
      estado: calcularEstado(d, alquilados, reservados).estado as string,
    }))
    .filter((d: { estado: string }) => d.estado !== "DISPONIBLE");
}

// Estado calculado (disponible, incompleto, alquilado, en lavado…) de los disfraces del
// catálogo: todos, o solo los ids indicados.
export async function estadosDeDisfraces(ids?: string[]) {
  await limpiarSuspensionesVencidas();

  const disfraces = await prisma.disfrazFisico.findMany({
    where: { origen: "CATALOGO", ...(ids ? { id: { in: ids } } : {}) },
    include: { prendasHogar: true, prendasActuales: true },
  });
  const [alquilados, reservados] = await Promise.all([obtenerAlquiladosAhoraIds(), obtenerReservadosIds()]);

  return disfraces.map((d: any) => ({
    id: d.id as string,
    nombre: d.nombre as string,
    familia: (d.familia ?? null) as string | null,
    estado: calcularEstado(d, alquilados, reservados).estado as string,
  }));
}

// --- Detalle de inventario (solo admin): qué prenda reemplaza a cuál ---

export type SituacionPrenda = "PRESENTE" | "REEMPLAZADA" | "FALTANTE" | "DANADA" | "PRESTADA";

interface ResumenPrendaAjena {
  id: string;
  nombre: string;
  color: string;
  talla: string;
  origenId: string;
  origenNombre: string;
}

interface PrendaDetalle {
  id: string;
  nombre: string;
  tipo: string;
  color: string;
  talla: string;
  calidad: string;
  estado: string;
  situacion: SituacionPrenda;
  prestadaA: { id: string; nombre: string; aMedida: boolean } | null;
  reemplazo: ResumenPrendaAjena | null;
  apartada: boolean;
}

// El emparejamiento prenda-reemplazo se hace por tipo, igual que contarFaltantes:
// cada «hueco» (prenda propia faltante/dañada, o prestada a otro disfraz) toma una
// prenda prestada y disponible del mismo tipo. Así el detalle y el estado general
// del disfraz nunca se contradicen.
export type EstadoTemporal = "ALQUILADO" | "EN_LAVADO" | "POR_DESARMAR";

// Disfraces a medida que hoy existen en el inventario: armados con piezas del almacén para un
// cliente, y que siguen alquilados o en lavado. Cuando se desarman (sus piezas vuelven al
// almacén) dejan de aparecer aquí solos; la reserva queda como historial.
export async function listarATemporales() {
  await limpiarSuspensionesVencidas(); // libera reservas vencidas, termina lavados y desarma lo que ya terminó

  const reservas = await prisma.reserva.findMany({
    where: { tipo: "A_MEDIDA", confirmadaEn: { not: null }, liberadaEn: null, disfrazFisico: { origen: "A_MEDIDA" } },
    include: {
      usuario: { select: { nombre: true, email: true } },
      disfrazFisico: {
        include: {
          prendasActuales: { include: { disfrazHogar: { select: { nombre: true } } } },
          alquileres: { include: { alquiler: { select: { estado: true, fechaInicio: true, fechaFin: true } } } },
        },
      },
    },
    orderBy: { creadoEn: "desc" },
  });

  return reservas.map((r: any) => {
    const d = r.disfrazFisico;
    const abierto = d.alquileres.map((a: any) => a.alquiler).find((a: any) => a.estado === "ACTIVO" || a.estado === "PENDIENTE");
    let estado: EstadoTemporal = "POR_DESARMAR";
    if (abierto) estado = "ALQUILADO";
    else if (d.estadoManual === "SUSPENDIDO") estado = "EN_LAVADO";

    return {
      id: d.id as string,
      nombre: d.nombre as string,
      tipoDisfraz: d.tipoDisfraz as string,
      cliente: { nombre: r.usuario.nombre as string, email: r.usuario.email as string },
      estado,
      fechaInicio: (abierto?.fechaInicio ?? null) as Date | null,
      fechaFin: (abierto?.fechaFin ?? null) as Date | null,
      lavadoHasta: lavadoHastaDe(d),
      tallaRopa: r.tallaRopa as string | null,
      tallaCalzado: r.tallaCalzado as string | null,
      prendas: d.prendasActuales.map((p: any) => ({
        id: p.id as string,
        nombre: p.nombre as string,
        tipo: p.tipo as string,
        color: p.color as string,
        talla: p.talla as string,
        origen: (p.disfrazHogar?.nombre ?? "") as string,
      })),
    };
  });
}

export async function obtenerDetalleInventario(id: string) {
  await limpiarSuspensionesVencidas();

  const d = await prisma.disfrazFisico.findUnique({
    where: { id },
    include: {
      prendasHogar: { include: { disfrazActual: { select: { id: true, nombre: true, origen: true } } } },
      prendasActuales: { include: { disfrazHogar: { select: { id: true, nombre: true } } } },
    },
  });
  if (!d) return null;

  const [alquiladosAhora, reservadosAhora] = await Promise.all([obtenerAlquiladosAhoraIds(), obtenerReservadosIds()]);
  const { estado, faseLavado } = calcularEstado(d, alquiladosAhora, reservadosAhora);
  const idsPiezas = [...d.prendasHogar.map((p) => p.id), ...d.prendasActuales.map((p) => p.id)];
  const apartadas = new Set(
    (
      await prisma.movimientoPrenda.findMany({
        where: { prendaId: { in: idsPiezas }, reserva: { liberadaEn: null } },
        select: { prendaId: true },
      })
    ).map((m) => m.prendaId)
  );

  // Prendas de otros disfraces que hoy completan a este.
  const prestadasRecibidas = d.prendasActuales.filter((p) => p.disfrazHogarId !== d.id);
  const usadas = new Set<string>();
  const reemplazaA = new Map<string, string>(); // id prenda prestada -> id prenda propia que cubre

  const resumen = (r: (typeof prestadasRecibidas)[number] | null): ResumenPrendaAjena | null =>
    r
      ? { id: r.id, nombre: r.nombre, color: r.color, talla: r.talla, origenId: r.disfrazHogar.id, origenNombre: r.disfrazHogar.nombre }
      : null;

  const tomarReemplazo = (tipo: string, huecoId: string) => {
    const r = prestadasRecibidas.find((x) => x.estado === "DISPONIBLE" && x.tipo === tipo && !usadas.has(x.id));
    if (!r) return null;
    usadas.add(r.id);
    reemplazaA.set(r.id, huecoId);
    return r;
  };

  const prendas = d.prendasHogar.map((p): PrendaDetalle => {
    const base = {
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo as string,
      color: p.color,
      talla: p.talla,
      calidad: p.calidad,
      estado: p.estado as string,
      apartada: apartadas.has(p.id),
    };

    // Prenda de este disfraz que hoy está prestada a otro.
    if (p.disfrazActualId !== d.id) {
      const reemplazo = tomarReemplazo(p.tipo, p.id);
      return {
        ...base,
        situacion: "PRESTADA",
        prestadaA: {
          id: p.disfrazActual.id,
          nombre: p.disfrazActual.nombre,
          aMedida: p.disfrazActual.origen === "A_MEDIDA",
        },
        reemplazo: resumen(reemplazo),
      };
    }

    if (p.estado === "DISPONIBLE") {
      return {
        ...base,
        situacion: "PRESENTE",
        prestadaA: null,
        reemplazo: null,
      };
    }

    const reemplazo = tomarReemplazo(p.tipo, p.id);

    return {
      ...base,
      situacion: reemplazo
        ? "REEMPLAZADA"
        : p.estado === "DANADA"
          ? "DANADA"
          : "FALTANTE",
      prestadaA: null,
      reemplazo: resumen(reemplazo),
    };
  });

  const alquiladoEste = alquiladosAhora.has(d.id);

  const prestamosRecibidos = prestadasRecibidas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo as string,
    color: r.color,
    talla: r.talla,
    estado: r.estado as string,
    origenId: r.disfrazHogar.id,
    origenNombre: r.disfrazHogar.nombre,
    reemplazaA: reemplazaA.get(r.id) ?? null,

    // Sobrante: llegó en préstamo pero ya no hace falta (por ejemplo, apareció la original).
    sobrante: r.estado === "DISPONIBLE" && !usadas.has(r.id),

    apartada: apartadas.has(r.id),

    puedeDevolverse:
      r.estado === "DISPONIBLE" &&
      !alquiladoEste &&
      !alquiladosAhora.has(r.disfrazHogar.id) &&
      !apartadas.has(r.id),
  }));

  return {
    id: d.id,
    nombre: d.nombre,
    familia: d.familia,
    grupoCompatibilidad: d.grupoCompatibilidad,
    tipoDisfraz: d.tipoDisfraz,
    precioAlquiler: d.precioAlquiler,
    estado,
    faseLavado,
    faltantes: contarFaltantes(d),
    completo: contarFaltantes(d) === 0,
    prestamosSalientes: contarPrestamosSalientes(d),
    prendas,
    prestamosRecibidos,
  };
}

export async function obtenerTemporadasDisponibles() {
  const filas = await prisma.disfrazFisico.findMany({
    where: { origen: "CATALOGO" },
    select: { temporadaEvento: true },
    distinct: ["temporadaEvento"],
  });
  return filas.map((f: { temporadaEvento: string }) => f.temporadaEvento);
}

export async function obtenerTiposDisponibles() {
  const filas = await prisma.disfrazFisico.findMany({
    where: { origen: "CATALOGO" },
    select: { tipoDisfraz: true },
    distinct: ["tipoDisfraz"],
  });
  return filas.map((f: { tipoDisfraz: string }) => f.tipoDisfraz);
}

// --- Gestión manual del inventario físico (admin) ---
// Todas bloqueadas mientras el disfraz esté alquilado.

export async function actualizarEstadoManual(id: string, estado: "EN_REPARACION" | "SUSPENDIDO" | null, actorId?: string) {
  if (await estaAlquiladoAhora(id)) throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");

  // El estado anterior se lee solo para el historial: si falla, el cambio se hace igual.
  let anterior: string | null | undefined;
  try {
    anterior = (await prisma.disfrazFisico.findUnique({ where: { id }, select: { estadoManual: true } }))?.estadoManual;
  } catch {
    anterior = undefined;
  }

  const actualizado = await prisma.disfrazFisico.update({ where: { id }, data: { estadoManual: estado } });

  if (anterior !== undefined && anterior !== estado) {
    await registrarEventoDisfraz({
      disfrazId: id,
      tipo: "ESTADO",
      usuarioId: actorId,
      detalle: `El administrador cambió el estado de «${etiquetaEstadoManual(anterior)}» a «${etiquetaEstadoManual(estado)}».`,
    });
  }
  return actualizado;
}

export async function actualizarPrenda(id: string, datos: { estado?: "DISPONIBLE" | "DANADA" | "FALTANTE"; calidad?: string }, actorId?: string) {
  const prenda = await prisma.prenda.findUnique({ where: { id } });
  if (!prenda) throw new Error("Prenda no encontrada");

  // Se bloquea si el disfraz de origen O el disfraz donde la prenda está hoy están alquilados.
  const alquilados = await obtenerAlquiladosAhoraIds();
  if (alquilados.has(prenda.disfrazHogarId) || alquilados.has(prenda.disfrazActualId)) {
    throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  }
  
  if (await estaApartada(id)) {
    throw new Error("Esta prenda está apartada por una reserva (ajuste de talla o disfraz a medida): vuelve sola a su lugar cuando termine.");
  }

  // Una pieza que está dentro de un disfraz a medida vuelve sola a su lugar al desarmarlo.
  if (prenda.disfrazActualId !== prenda.disfrazHogarId) {
    const holder = await prisma.disfrazFisico.findUnique({ where: { id: prenda.disfrazActualId }, select: { origen: true } });
    if (holder?.origen === "A_MEDIDA") {
      throw new Error("Esta prenda está en un disfraz a medida: vuelve sola a su lugar cuando ese disfraz se desarme.");
    }
  }

  const actualizada = await prisma.prenda.update({ where: { id }, data: datos });

  // El historial nunca debe impedir el cambio: cualquier fallo al armarlo se ignora.
  try {
    const cambios: string[] = [];
    if (datos.estado && datos.estado !== prenda.estado) {
      cambios.push(`estado «${etiquetaEstadoPrenda(prenda.estado)}» → «${etiquetaEstadoPrenda(datos.estado)}»`);
    }
    if (datos.calidad && datos.calidad !== prenda.calidad) cambios.push(`calidad «${prenda.calidad}» → «${datos.calidad}»`);
    if (cambios.length > 0) {
      const detalle = `${prenda.nombre}: ${cambios.join("; ")}.`;
      await registrarEventoDisfraz({ disfrazId: prenda.disfrazHogarId, tipo: "PRENDA", prendaId: id, usuarioId: actorId, detalle });
      if (prenda.disfrazActualId !== prenda.disfrazHogarId) {
        await registrarEventoDisfraz({
          disfrazId: prenda.disfrazActualId,
          tipo: "PRENDA",
          prendaId: id,
          usuarioId: actorId,
          detalle: `${detalle} (prenda prestada a este disfraz)`,
        });
      }
    }
  } catch {
    // sin historial
  }
  return actualizada;
}

export interface CandidatoReemplazo {
  id: string;
  nombre: string;
  calidad: string;
  color: string;
  talla: string;
  disfrazOrigenId: string;
  disfrazOrigenNombre: string;
  disfrazOrigenAlquilado: boolean;
  esAlmacen: boolean;
  mismaFamilia: boolean;
  mismaTalla: boolean;
  mismoColor: boolean;
}

// Candidatos para reemplazar una prenda. Reglas:
//  - mismo tipo de prenda, disponible y «en su casa» (no prestada ya a otro disfraz);
//  - vienen de DOS fuentes: (1) repuestos del almacén con el MISMO NOMBRE que la prenda a
//    reponer, y (2) piezas de disfraces del mismo grupo de compatibilidad;
//  - su disfraz de origen NO puede estar en lavado ni tener una reserva vigente;
//  - orden: no alquilados primero y, entre ellos, por encaje: almacén 4 + misma familia 4
//    + misma talla 2 + mismo color 1. Con empate gana el almacén, porque no deja
//    incompleto a ningún otro disfraz.
// Solo los disfraces del catálogo reciben reemplazos. «Disfraz que la necesita»: por defecto
// el de origen de la prenda; en una devolución se indica el disfraz donde estaba en uso.
export async function buscarCandidatos(prendaId: string, disfrazNecesitadoId?: string): Promise<CandidatoReemplazo[]> {
  // Libera primero los lavados ya terminados y las reservas vencidas, para que no bloqueen candidatos de más.
  await limpiarSuspensionesVencidas();

  const prenda = await prisma.prenda.findUnique({ where: { id: prendaId } });
  if (!prenda) throw new Error("Prenda no encontrada");

  const necesitado = await prisma.disfrazFisico.findUnique({
    where: { id: disfrazNecesitadoId ?? prenda.disfrazHogarId },
  });
  if (!necesitado) throw new Error("Disfraz no encontrado");

  // El almacén y los disfraces a medida no reciben reemplazos.
  if (necesitado.origen !== "CATALOGO") return [];

  const origenes: Prisma.PrendaWhereInput[] = [
    { nombre: { equals: prenda.nombre, mode: "insensitive" }, disfrazHogar: { origen: "ALMACEN" } },
  ];
  if (necesitado.grupoCompatibilidad) {
    origenes.push({ disfrazHogar: { origen: "CATALOGO", grupoCompatibilidad: necesitado.grupoCompatibilidad } });
  }

  const candidatas = await prisma.prenda.findMany({
    where: {
      tipo: prenda.tipo,
      estado: "DISPONIBLE",
      id: { not: prendaId },
      disfrazHogarId: { not: necesitado.id },
      OR: origenes,
    },
    include: { disfrazHogar: true },
  });

  const reservados = await obtenerReservadosIds();
  const enCasa = candidatas.filter(
    (p: any) =>
      p.disfrazActualId === p.disfrazHogarId && !estaEnLavado(p.disfrazHogar) && !reservados.has(p.disfrazHogarId)
  );

  const alquiladosAhora = await obtenerAlquiladosAhoraIds();

  const candidatos: CandidatoReemplazo[] = enCasa.map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    calidad: p.calidad,
    color: p.color,
    talla: p.talla,
    disfrazOrigenId: p.disfrazHogarId,
    disfrazOrigenNombre: p.disfrazHogar.nombre,
    disfrazOrigenAlquilado: alquiladosAhora.has(p.disfrazHogarId),
    esAlmacen: p.disfrazHogar.origen === "ALMACEN",
    mismaFamilia: !!necesitado.familia && p.disfrazHogar.familia === necesitado.familia,
    mismaTalla: p.talla === prenda.talla,
    mismoColor: p.color === prenda.color,
  }));

  const puntaje = (c: CandidatoReemplazo) =>
    (c.esAlmacen ? 4 : 0) + (c.mismaFamilia ? 4 : 0) + (c.mismaTalla ? 2 : 0) + (c.mismoColor ? 1 : 0);

  return candidatos.sort(
    (a, b) =>
      Number(a.disfrazOrigenAlquilado) - Number(b.disfrazOrigenAlquilado) ||
      puntaje(b) - puntaje(a) ||
      Number(b.esAlmacen) - Number(a.esAlmacen)
  );
}

export async function confirmarPrestamo(prendaNecesitadaId: string, prendaDonanteId: string) {
  const prendaNecesitada = await prisma.prenda.findUnique({ where: { id: prendaNecesitadaId } });
  if (!prendaNecesitada) throw new Error("Prenda no encontrada");
  if (await estaAlquiladoAhora(prendaNecesitada.disfrazHogarId)) {
    throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  }

  // El servidor revalida la compatibilidad: no se confía en que el frontend
  // solo ofrezca candidatos válidos.
  const candidatos = await buscarCandidatos(prendaNecesitadaId);
  const elegido = candidatos.find((c) => c.id === prendaDonanteId);
  if (!elegido) throw new Error("La prenda elegida no es un reemplazo válido: debe ser de un disfraz compatible y que no esté en lavado.");
  if (elegido.disfrazOrigenAlquilado) throw new Error("El disfraz donante está alquilado en este momento.");

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

// Devuelve una prenda prestada a su disfraz de origen.
export async function devolverPrestamo(prendaId: string) {
  const prenda = await prisma.prenda.findUnique({ where: { id: prendaId } });
  if (!prenda) throw new Error("Prenda no encontrada");

  if (prenda.disfrazActualId === prenda.disfrazHogarId) {
    throw new Error("Esta prenda no está prestada: ya está en su disfraz de origen.");
  }
  if (prenda.estado !== "DISPONIBLE") {
    throw new Error("Solo se puede devolver una prenda en buen estado.");
  }
  
  if (await estaApartada(prendaId)) {
    throw new Error("Esta prenda está apartada por una reserva (ajuste de talla o disfraz a medida): vuelve sola a su lugar cuando termine.");
  }
  
  const [actual, hogar] = await Promise.all([
    prisma.disfrazFisico.findUnique({ where: { id: prenda.disfrazActualId } }),
    prisma.disfrazFisico.findUnique({ where: { id: prenda.disfrazHogarId } }),
  ]);

  // Una pieza dentro de un disfraz a medida vuelve sola al desarmarlo: moverla a mano
  // rompería la reserva.
  if (actual?.origen === "A_MEDIDA") {
    throw new Error("Esta prenda está en un disfraz a medida: vuelve sola a su lugar cuando ese disfraz se desarme.");
  }

  const alquilados = await obtenerAlquiladosAhoraIds();
  if (alquilados.has(prenda.disfrazActualId) || alquilados.has(prenda.disfrazHogarId)) {
    throw new Error("Alguno de los dos disfraces está alquilado — no se puede mover la prenda hasta que se devuelva.");
  }

  const devuelta = await prisma.prenda.update({
    where: { id: prendaId },
    data: { disfrazActualId: prenda.disfrazHogarId },
  });

  await prisma.sustitucion.create({
    data: {
      prendaId,
      disfrazOrigenId: prenda.disfrazActualId,
      disfrazDestinoId: prenda.disfrazHogarId,
      motivo: `Préstamo devuelto: ${prenda.nombre} vuelve de ${actual?.nombre} a ${hogar?.nombre}`,
    },
  });

  return devuelta;
}
