import { prisma } from "../../config/prisma";
import { CrearDisfrazInput } from "./disfraces.schema";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

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

// Un disfraz está "en lavado" mientras dura su ciclo de 3 días hábiles tras una
// devolución. Usa la misma regla que calcularEstado, así que nunca se contradicen.
function estaEnLavado(d: { estadoManual: string | null; fechaSuspension: Date | null }): boolean {
  if (d.estadoManual !== "SUSPENDIDO" || !d.fechaSuspension) return false;
  return faseLavadoPorDias(diasHabilesTranscurridos(d.fechaSuspension, new Date())) !== null;
}

// Libera automáticamente los disfraces cuyo ciclo de lavado (3 días hábiles) ya
// terminó, sincronizado con el reloj real y sin confirmación del administrador.
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
// (fueron prestadas): es la alerta de "a este disfraz se le usó una pieza".
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
  }
  if (disfracesAlquiladosAhora.has(disfraz.id)) return { estado: "ALQUILADO", faseLavado: null };
  if (contarFaltantes(disfraz) > 0) return { estado: "INCOMPLETO", faseLavado: null };
  return { estado: "DISPONIBLE", faseLavado: null };
}

async function obtenerAlquiladosAhoraIds(): Promise<Set<string>> {
  // Un disfraz sigue "alquilado" mientras el alquiler no se cierre con una
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

export async function listarDisfraces(filtros: FiltrosDisfraz) {
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

// Disfraces de una lista que NO se pueden alquilar ahora (alquilados, incompletos, en lavado
// o en reparación). Es la misma regla que muestra el catálogo, pero comprobada en el servidor.
export async function disfracesNoDisponibles(ids: string[]) {
  await limpiarSuspensionesVencidas();

  const disfraces = await prisma.disfrazFisico.findMany({
    where: { id: { in: ids } },
    include: { prendasHogar: true, prendasActuales: true },
  });
  const alquilados = await obtenerAlquiladosAhoraIds();

  return disfraces
    .map((d: any) => ({ id: d.id as string, nombre: d.nombre as string, estado: calcularEstado(d, alquilados).estado }))
    .filter((d: { estado: string }) => d.estado !== "DISPONIBLE");
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
  prestadaA: { id: string; nombre: string } | null;
  reemplazo: ResumenPrendaAjena | null;
}

// El emparejamiento prenda-reemplazo se hace por tipo, igual que contarFaltantes:
// cada "hueco" (prenda propia faltante/dañada, o prestada a otro disfraz) toma una
// prenda prestada y disponible del mismo tipo. Así el detalle y el estado general
// del disfraz nunca se contradicen.
export async function obtenerDetalleInventario(id: string) {
  await limpiarSuspensionesVencidas();

  const d = await prisma.disfrazFisico.findUnique({
    where: { id },
    include: {
      prendasHogar: { include: { disfrazActual: { select: { id: true, nombre: true } } } },
      prendasActuales: { include: { disfrazHogar: { select: { id: true, nombre: true } } } },
    },
  });
  if (!d) return null;

  const alquiladosAhora = await obtenerAlquiladosAhoraIds();
  const { estado, faseLavado } = calcularEstado(d, alquiladosAhora);

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
    };

    // Prenda de este disfraz que hoy está prestada a otro.
    if (p.disfrazActualId !== d.id) {
      const reemplazo = tomarReemplazo(p.tipo, p.id);
      return {
        ...base,
        situacion: "PRESTADA",
        prestadaA: { id: p.disfrazActual.id, nombre: p.disfrazActual.nombre },
        reemplazo: resumen(reemplazo),
      };
    }

    if (p.estado === "DISPONIBLE") {
      return { ...base, situacion: "PRESENTE", prestadaA: null, reemplazo: null };
    }

    const reemplazo = tomarReemplazo(p.tipo, p.id);
    return {
      ...base,
      situacion: reemplazo ? "REEMPLAZADA" : p.estado === "DANADA" ? "DANADA" : "FALTANTE",
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
    puedeDevolverse: r.estado === "DISPONIBLE" && !alquiladoEste && !alquiladosAhora.has(r.disfrazHogar.id),
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

export async function actualizarEstadoManual(id: string, estado: "EN_REPARACION" | "SUSPENDIDO" | null) {
  if (await estaAlquiladoAhora(id)) throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  return prisma.disfrazFisico.update({ where: { id }, data: { estadoManual: estado } });
}

export async function actualizarPrenda(id: string, datos: { estado?: "DISPONIBLE" | "DANADA" | "FALTANTE"; calidad?: string }) {
  const prenda = await prisma.prenda.findUnique({ where: { id } });
  if (!prenda) throw new Error("Prenda no encontrada");

  // Se bloquea si el disfraz de origen O el disfraz donde la prenda está hoy están alquilados.
  const alquilados = await obtenerAlquiladosAhoraIds();
  if (alquilados.has(prenda.disfrazHogarId) || alquilados.has(prenda.disfrazActualId)) {
    throw new Error("Este disfraz está alquilado — no se puede modificar hasta que se devuelva.");
  }
  return prisma.prenda.update({ where: { id }, data: datos });
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
//  - su disfraz de origen NO puede estar en ciclo de lavado;
//  - orden: no alquilados primero y, entre ellos, por encaje: almacén 4 + misma familia 4
//    + misma talla 2 + mismo color 1. Con empate gana el almacén, porque no deja
//    incompleto a ningún otro disfraz.
// Solo los disfraces del catálogo reciben reemplazos. «Disfraz que la necesita»: por defecto
// el de origen de la prenda; en una devolución se indica el disfraz donde estaba en uso.
export async function buscarCandidatos(prendaId: string, disfrazNecesitadoId?: string): Promise<CandidatoReemplazo[]> {
  // Libera primero los lavados ya terminados, para que no bloqueen candidatos de más.
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
  const enCasa = candidatas.filter(
    (p: any) => p.disfrazActualId === p.disfrazHogarId && !estaEnLavado(p.disfrazHogar)
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

  const alquilados = await obtenerAlquiladosAhoraIds();
  if (alquilados.has(prenda.disfrazActualId) || alquilados.has(prenda.disfrazHogarId)) {
    throw new Error("Alguno de los dos disfraces está alquilado — no se puede mover la prenda hasta que se devuelva.");
  }

  const [actual, hogar] = await Promise.all([
    prisma.disfrazFisico.findUnique({ where: { id: prenda.disfrazActualId } }),
    prisma.disfrazFisico.findUnique({ where: { id: prenda.disfrazHogarId } }),
  ]);

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