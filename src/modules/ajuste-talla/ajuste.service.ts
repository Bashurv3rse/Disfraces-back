import { Prisma } from "@prisma/client";
import type { TipoPrenda } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { normalizar } from "../../common/texto";
import { categoriaTalla, normalizarTalla, ordenTalla, tallaValida, tallasPermitidas } from "../../common/tallas";
import { disfracesNoDisponibles, estadosDeDisfraces } from "../disfraces/disfraces.service";
import { MINUTOS_RESERVA_INICIAL, liberarReservasVencidas } from "../a-medida/reservas.base";
import { MAX_RESERVAS_SIN_PAGAR } from "../a-medida/reservas.service";
import type { TallasPedido } from "../a-medida/armado.service";

// Si es false, solo se intercambian piezas con el almacén: ninguna otra instancia del catálogo queda «Reservada».
export const PERMITIR_DONANTES_DE_FAMILIA = true;

const INTENTOS = 2;
const ORDEN_TIPOS = ["SOMBRERO", "PANUELO", "ABRIGO", "CHALECO", "CAMISA", "FALDA", "PANTALON", "ZAPATO", "TACON", "ACCESORIO"];

const TEXTO_ESTADO: Record<string, string> = {
  ALQUILADO: "está alquilado",
  RESERVADO: "está reservado por otra persona",
  INCOMPLETO: "está incompleto",
  SUSPENDIDO: "está en lavado",
  EN_REPARACION: "está en reparación",
};

export class ErrorAjuste extends Error {
  constructor(mensaje: string, public readonly estado: number = 400, public readonly datos?: unknown) {
    super(mensaje);
  }
}

class ConflictoPiezas extends Error {}

function esConflicto(error: unknown): boolean {
  return (
    error instanceof ConflictoPiezas ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
  );
}

// ---------- Tipos ----------

export interface PrendaDisfraz {
  id: string;
  nombre: string;
  tipo: string;
  color: string;
  talla: string;
}

export interface DonantePrenda extends PrendaDisfraz {
  origen: "ALMACEN" | "DISFRAZ";
  disfrazId: string;
  disfrazNombre: string;
  familia: string | null;
}

export interface Intercambio {
  original: PrendaDisfraz;
  donante: DonantePrenda;
}

export interface PiezaResultado {
  prendaId: string;
  nombre: string;
  tipo: string;
  color: string;
  talla: string;
  tallaOriginal: string;
  cambia: boolean;
}

export interface PiezaSinCubrir {
  prendaId: string;
  nombre: string;
  tipo: string;
  tallaPedida: string;
  motivo: string;
  tallasDisponibles: string[];
}

export interface OpcionPrenda {
  prendaId: string;
  nombre: string;
  tipo: string;
  categoria: string;
  tallas: string[];
}

export interface ResultadoAjuste {
  piezas: PiezaResultado[];
  intercambios: Intercambio[];
  faltantes: PiezaSinCubrir[];
  completo: boolean;
  opciones: OpcionPrenda[];
}

// ---------- Tallas (cálculo puro) ----------

export function validarTallasPrendas(prendas: PrendaDisfraz[], tallas: TallasPedido): string[] {
  const errores: string[] = [];
  const ajustes = tallas.ajustes ?? {};
  const requiere = (categoria: string) => prendas.some((p) => categoriaTalla(p.tipo) === categoria && !ajustes[p.id]);

  if (requiere("ROPA")) {
    const ropa = normalizarTalla("CAMISA", tallas.ropa ?? "");
    if (!ropa) errores.push("Indica tu talla de ropa.");
    else if (!tallaValida("CAMISA", ropa)) {
      errores.push(`La talla de ropa «${tallas.ropa}» no es válida. Usa una de: ${tallasPermitidas("CAMISA").join(", ")}.`);
    }
  }

  if (requiere("CALZADO")) {
    const calzado = normalizarTalla("ZAPATO", tallas.calzado ?? "");
    if (!calzado) errores.push("Indica tu talla de calzado.");
    else if (!tallaValida("ZAPATO", calzado)) {
      errores.push(`La talla de calzado «${tallas.calzado}» no es válida. Usa una de: ${tallasPermitidas("ZAPATO").join(", ")}.`);
    }
  }

  for (const [prendaId, talla] of Object.entries(ajustes)) {
    const p = prendas.find((x) => x.id === prendaId);
    if (!p) {
      errores.push("Hay un ajuste de talla para una pieza que no está en este disfraz.");
      continue;
    }
    if (categoriaTalla(p.tipo) === "UNICA") {
      errores.push(`«${p.nombre}» es de talla única: no admite ajuste.`);
      continue;
    }
    if (!tallaValida(p.tipo, normalizarTalla(p.tipo, talla))) {
      errores.push(`La talla «${talla}» no es válida para «${p.nombre}».`);
    }
  }
  return errores;
}

// null = la pieza no se ajusta (talla única).
function tallaObjetivo(p: PrendaDisfraz, t: TallasPedido): string | null {
  const cat = categoriaTalla(p.tipo);
  if (cat === "UNICA") return null;
  const ajuste = t.ajustes?.[p.id];
  if (ajuste) return normalizarTalla(p.tipo, ajuste);
  return normalizarTalla(p.tipo, (cat === "CALZADO" ? t.calzado : t.ropa) ?? "");
}

const mismo = (a: string, b: string) => normalizar(a) === normalizar(b);

// Qué tan buena pareja es un donante para una pieza (0 = la mejor; null = no sirve).
function rangoDonante(original: PrendaDisfraz, d: DonantePrenda, familia: string | null, permitirFamilia: boolean): number | null {
  if (d.tipo !== original.tipo) return null;
  if (d.origen === "ALMACEN") {
    if (mismo(d.nombre, original.nombre)) return 0; // repuesto del almacén con el mismo nombre
    if (mismo(d.color, original.color)) return 2; // mismo tipo y color
    return null;
  }
  if (!permitirFamilia || !familia || !d.familia || !mismo(d.familia, familia)) return null;
  return mismo(d.nombre, original.nombre) ? 1 : null; // otra instancia de la misma familia
}

interface EntradaIntercambios {
  familia: string | null;
  prendas: PrendaDisfraz[];
  tallas: TallasPedido;
  donantes: DonantePrenda[];
  permitirFamilia?: boolean;
}

type Par = { d: DonantePrenda; rango: number };

// ---------- Selección de intercambios (cálculo puro, sin base de datos) ----------

export function elegirIntercambios(entrada: EntradaIntercambios): ResultadoAjuste {
  const { tallas, donantes, familia } = entrada;
  const permitirFamilia = entrada.permitirFamilia ?? PERMITIR_DONANTES_DE_FAMILIA;

  const prendas = [...entrada.prendas].sort(
    (a, b) =>
      ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre, "es") || a.id.localeCompare(b.id)
  );

  const compatibles = (p: PrendaDisfraz): Par[] =>
    donantes.flatMap((d) => {
      const rango = rangoDonante(p, d, familia, permitirFamilia);
      return rango === null ? [] : [{ d, rango }];
    });

  const preferencia = (p: PrendaDisfraz) => (a: Par, b: Par) =>
    a.rango - b.rango ||
    Number(mismo(b.d.color, p.color)) - Number(mismo(a.d.color, p.color)) ||
    a.d.disfrazNombre.localeCompare(b.d.disfrazNombre, "es", { numeric: true }) ||
    a.d.id.localeCompare(b.d.id);

  const usadas = new Set<string>();
  const piezas: PiezaResultado[] = [];
  const intercambios: Intercambio[] = [];
  const faltantes: PiezaSinCubrir[] = [];

  for (const p of prendas) {
    const objetivo = tallaObjetivo(p, tallas);
    const sinCambio: PiezaResultado = {
      prendaId: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      color: p.color,
      talla: p.talla,
      tallaOriginal: p.talla,
      cambia: false,
    };

    if (objetivo === null || objetivo === p.talla) {
      piezas.push(sinCambio);
      continue;
    }

    const elegido = compatibles(p)
      .filter((x) => !usadas.has(x.d.id) && x.d.talla === objetivo)
      .sort(preferencia(p))[0];

    if (elegido) {
      usadas.add(elegido.d.id);
      intercambios.push({ original: p, donante: elegido.d });
      piezas.push({ ...sinCambio, nombre: elegido.d.nombre, color: elegido.d.color, talla: elegido.d.talla, cambia: true });
      continue;
    }

    const disponibles = Array.from(new Set([p.talla, ...compatibles(p).map((x) => x.d.talla)])).sort(
      (a, b) => ordenTalla(p.tipo, a) - ordenTalla(p.tipo, b)
    );
    const lista = disponibles.map((t) => (t === p.talla ? `${t} (la que ya trae)` : t)).join(", ");
    faltantes.push({
      prendaId: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      tallaPedida: objetivo,
      motivo: `No hay una pieza equivalente a «${p.nombre}» en talla ${objetivo}. Tallas posibles: ${lista}.`,
      tallasDisponibles: disponibles,
    });
    piezas.push(sinCambio);
  }

  const opciones: OpcionPrenda[] = prendas
    .filter((p) => categoriaTalla(p.tipo) !== "UNICA")
    .map((p) => ({
      prendaId: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      categoria: categoriaTalla(p.tipo),
      tallas: Array.from(new Set([p.talla, ...compatibles(p).map((x) => x.d.talla)])).sort(
        (a, b) => ordenTalla(p.tipo, a) - ordenTalla(p.tipo, b)
      ),
    }));

  return { piezas, intercambios, faltantes, completo: faltantes.length === 0, opciones };
}

// ---------- Lectura de la base de datos ----------

async function cargarDisfraz(disfrazId: string) {
  const d = await prisma.disfrazFisico.findUnique({
    where: { id: disfrazId },
    select: {
      id: true,
      nombre: true,
      familia: true,
      origen: true,
      tipoDisfraz: true,
      precioAlquiler: true,
      prendasActuales: { select: { id: true, nombre: true, tipo: true, color: true, talla: true, estado: true } },
    },
  });
  if (!d || d.origen !== "CATALOGO") throw new ErrorAjuste("Disfraz no encontrado.", 404);
  return d;
}

type DisfrazCargado = Awaited<ReturnType<typeof cargarDisfraz>>;

// Las piezas que la persona recibiría: las que están hoy dentro del disfraz y en buen estado.
function piezasDe(d: DisfrazCargado): PrendaDisfraz[] {
  return d.prendasActuales
    .filter((p) => p.estado === "DISPONIBLE")
    .map((p) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo as string, color: p.color, talla: p.talla }));
}

// Devuelve el motivo por el que NO se puede ajustar, o null si se puede.
async function motivoNoAjustable(d: DisfrazCargado, usuarioId: string): Promise<string | null> {
  await liberarReservasVencidas();

  const propia = await prisma.reserva.findFirst({
    where: { disfrazFisicoId: d.id, usuarioId, liberadaEn: null, confirmadaEn: null },
    select: { id: true },
  });
  if (propia) return "Ya tienes este disfraz reservado con tus tallas. Págalo o cancela la reserva para cambiarlas.";

  const ocupados = await disfracesNoDisponibles([d.id], usuarioId);
  if (ocupados.length > 0) return `«${d.nombre}» ${TEXTO_ESTADO[ocupados[0].estado] ?? "no está disponible"} ahora.`;
  return null;
}

async function cargarDonantes(costumeId: string, tipos: string[], excluir: string[] = []): Promise<DonantePrenda[]> {
  const [prendas, estados, reservas] = await Promise.all([
    prisma.prenda.findMany({
      where: {
        tipo: { in: tipos as TipoPrenda[] },
        estado: "DISPONIBLE",
        calidad: { not: "baja" },
        disfrazHogarId: { notIn: [costumeId, ...excluir] },
        disfrazHogar: { origen: { in: ["ALMACEN", "CATALOGO"] } },
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        color: true,
        talla: true,
        disfrazHogarId: true,
        disfrazActualId: true,
        disfrazHogar: { select: { id: true, nombre: true, origen: true, familia: true } },
      },
    }),
    estadosDeDisfraces(),
    prisma.reserva.findMany({ where: { liberadaEn: null }, select: { disfrazFisicoId: true } }),
  ]);

  const enReserva = new Set(reservas.map((r) => r.disfrazFisicoId));
  const estadoPorId = new Map(estados.map((e) => [e.id, e.estado] as const));
  const donantes: DonantePrenda[] = [];

  for (const p of prendas) {
    if (p.disfrazActualId !== p.disfrazHogarId) continue; // no está en su sitio

    const h = p.disfrazHogar;
    if (h.origen === "CATALOGO") {
      // Solo disfraces libres: nunca alquilados, en lavado, en reparación ni con una reserva viva.
      const estado = estadoPorId.get(h.id);
      if (!estado || !["DISPONIBLE", "INCOMPLETO"].includes(estado)) continue;
      if (enReserva.has(h.id)) continue;
    }

    donantes.push({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo as string,
      color: p.color,
      talla: p.talla,
      origen: h.origen === "ALMACEN" ? "ALMACEN" : "DISFRAZ",
      disfrazId: h.id,
      disfrazNombre: h.nombre,
      familia: h.familia,
    });
  }
  return donantes;
}

async function calcular(d: DisfrazCargado, tallas: TallasPedido, excluir: string[] = []) {
  const prendas = piezasDe(d);
  const errores = validarTallasPrendas(prendas, tallas);
  if (errores.length > 0) throw new ErrorAjuste(errores.join(" "), 400);

  const donantes = await cargarDonantes(d.id, Array.from(new Set(prendas.map((p) => p.tipo))), excluir);
  return elegirIntercambios({ familia: d.familia, prendas, tallas, donantes });
}

// ---------- API: información, propuesta y reserva ----------

export async function infoAjuste(disfrazId: string, usuarioId: string) {
  const d = await cargarDisfraz(disfrazId);
  const motivo = await motivoNoAjustable(d, usuarioId);

  const piezas = piezasDe(d)
    .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => ({ ...p, categoria: categoriaTalla(p.tipo) as string }));
  const hayAjustables = piezas.some((p) => p.categoria !== "UNICA");

  return {
    disfraz: { id: d.id, nombre: d.nombre, precioDia: Number(d.precioAlquiler) },
    ajustable: motivo === null && hayAjustables,
    motivo: motivo ?? (hayAjustables ? null : "Este disfraz no tiene piezas con talla que se puedan ajustar."),
    piezas,
    pideTallaRopa: piezas.some((p) => p.categoria === "ROPA"),
    pideTallaCalzado: piezas.some((p) => p.categoria === "CALZADO"),
  };
}

// Calcula la propuesta sin reservar ni mover nada. No revela de qué disfraz sale cada pieza.
export async function previsualizarAjuste(
  disfrazId: string,
  tallas: TallasPedido,
  usuarioId: string,
  excluir: string[] = []
) {
  const d = await cargarDisfraz(disfrazId);
  const motivo = await motivoNoAjustable(d, usuarioId);
  if (motivo) throw new ErrorAjuste(motivo, 409);

  const r = await calcular(d, tallas, excluir);

  return {
    disfraz: {
      id: d.id,
      nombre: d.nombre,
      precioDia: Number(d.precioAlquiler),
    },
    completo: r.completo,
    cambios: r.intercambios.length,
    piezas: r.piezas,
    faltantes: r.faltantes,
    opciones: r.opciones,
  };
}

async function aplicar(usuarioId: string, d: DisfrazCargado, r: ResultadoAjuste, tallas: TallasPedido) {
  const vence = new Date(Date.now() + MINUTOS_RESERVA_INICIAL * 60_000);
  const involucrados = [d.id, ...Array.from(new Set(r.intercambios.filter((i) => i.donante.origen === "DISFRAZ").map((i) => i.donante.disfrazId)))];

  return prisma.$transaction(
    async (tx) => {
      // Entre la propuesta y ahora, nadie pudo alquilar ni reservar estos disfraces.
      const alquilados = await tx.alquilerDisfraz.count({
        where: { disfrazFisicoId: { in: involucrados }, alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } } },
      });
      const reservados = await tx.reserva.count({ where: { liberadaEn: null, disfrazFisicoId: { in: involucrados } } });
      if (alquilados > 0 || reservados > 0) throw new ConflictoPiezas();

      const reserva = await tx.reserva.create({
        data: {
          tipo: "AJUSTE_TALLA",
          usuarioId,
          disfrazFisicoId: d.id,
          tallaRopa: tallas.ropa ?? null,
          tallaCalzado: tallas.calzado ?? null,
          vence,
        },
      });

      let orden = 0;
      for (const { original, donante } of r.intercambios) {
        // Cada pieza solo se mueve si SIGUE donde y como la vio el motor.
        const sale = await tx.prenda.updateMany({
          where: { id: original.id, disfrazActualId: d.id, estado: "DISPONIBLE" },
          data: { disfrazActualId: donante.disfrazId },
        });
        if (sale.count !== 1) throw new ConflictoPiezas();

        const entra = await tx.prenda.updateMany({
          where: { id: donante.id, disfrazActualId: donante.disfrazId, estado: "DISPONIBLE" },
          data: { disfrazActualId: d.id },
        });
        if (entra.count !== 1) throw new ConflictoPiezas();

        await tx.movimientoPrenda.create({
          data: { reservaId: reserva.id, prendaId: original.id, desdeId: d.id, haciaId: donante.disfrazId, orden: orden++ },
        });
        await tx.movimientoPrenda.create({
          data: { reservaId: reserva.id, prendaId: donante.id, desdeId: donante.disfrazId, haciaId: d.id, orden: orden++ },
        });
      }

      return { reservaId: reserva.id, vence };
    },
    { timeout: 10_000 }
  );
}

export async function reservarAjuste(
  disfrazId: string,
  tallas: TallasPedido,
  usuarioId: string,
  excluir: string[] = []
) {
  await liberarReservasVencidas();

  const activas = await prisma.reserva.count({
    where: {
      usuarioId,
      liberadaEn: null,
      confirmadaEn: null,
    },
  });

  if (activas >= MAX_RESERVAS_SIN_PAGAR) {
    throw new ErrorAjuste(
      `Ya tienes ${activas} disfraces reservados sin pagar. Paga o cancela alguno antes de reservar otro.`,
      409
    );
  }

  for (let intento = 1; intento <= INTENTOS; intento++) {
    const d = await cargarDisfraz(disfrazId);
    const motivo = await motivoNoAjustable(d, usuarioId);
    if (motivo) throw new ErrorAjuste(motivo, 409);

    const r = await calcular(d, tallas, excluir);

    if (!r.completo) {
      throw new ErrorAjuste(
        `No se pueden ajustar las tallas ahora mismo. ${r.faltantes
          .map((f) => f.motivo)
          .join(" ")}`,
        409,
        {
          faltantes: r.faltantes,
        }
      );
    }

    if (r.intercambios.length === 0) {
      throw new ErrorAjuste(
        "Este disfraz ya viene en las tallas que elegiste: agrégalo al carrito directamente.",
        409
      );
    }

    try {
      const creada = await aplicar(usuarioId, d, r, tallas);

      const donantes = Array.from(
        new Set(r.intercambios.map((i) => i.donante.disfrazNombre))
      );

      return {
        reserva: {
          reservaId: creada.reservaId,
          disfrazId: d.id,
          nombre: d.nombre,
          tipoDisfraz: d.tipoDisfraz,
          precioDia: Number(d.precioAlquiler),
          vence: creada.vence,
          segundosRestantes: Math.max(
            0,
            Math.round((creada.vence.getTime() - Date.now()) / 1000)
          ),
          cambios: r.intercambios.length,
          piezas: r.piezas.map((p) => ({
            prendaId: p.prendaId,
            tipo: p.tipo,
            nombre: p.nombre,
            color: p.color,
            talla: p.talla,
          })),
        },
        auditoria: `${d.nombre} · ${r.intercambios.length} cambio(s) de talla [${donantes.join(", ")}]`,
      };
    } catch (error) {
      // Otra persona se llevó una de las piezas justo antes: se vuelve a calcular.
      if (esConflicto(error) && intento < INTENTOS) continue;

      if (esConflicto(error)) {
        throw new ErrorAjuste(
          "Alguien reservó o alquiló esas piezas al mismo tiempo. Intenta de nuevo en unos segundos.",
          409
        );
      }

      throw error;
    }
  }

  throw new ErrorAjuste(
    "No se pudo reservar el disfraz. Intenta de nuevo.",
    409
  );
}