import type { TipoPrenda } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { normalizar } from "../../common/texto";
import {
  TALLA_UNICA,
  categoriaTalla,
  normalizarTalla,
  ordenTalla,
  tallaValida,
  tallasPermitidas,
} from "../../common/tallas";
import { cumpleHueco } from "../recetas/recetas.service";
import { estadosDeDisfraces } from "../disfraces/disfraces.service";
import { liberarReservasVencidas } from "./reservas.base";

// Tope de piezas que un armado puede tomar de OTROS disfraces del catálogo. Es la salvaguarda
// contra dejar muchos disfraces incompletos por armar uno solo: súbelo o bájalo aquí.
export const MAX_PIEZAS_DE_OTROS_DISFRACES = 2;

// De la cabeza a los pies (mismo orden que la pantalla de recetas).
const ORDEN_TIPOS = ["SOMBRERO", "PANUELO", "ABRIGO", "CHALECO", "CAMISA", "FALDA", "PANTALON", "ZAPATO", "TACON", "ACCESORIO"];

export class ErrorArmado extends Error {
  constructor(mensaje: string, public readonly estado: number = 400) {
    super(mensaje);
  }
}

// ---------- Tipos ----------

export interface TallasPedido {
  ropa?: string;
  calzado?: string;
  // Ajuste opcional por pieza: id del hueco de la receta -> talla.
  ajustes?: Record<string, string>;
}

export interface HuecoEntrada {
  id: string;
  etiqueta: string;
  tipo: string;
  colores: string[];
  nombreContiene: string | null;
  obligatoria: boolean;
}

export interface PiezaCandidata {
  id: string;
  nombre: string;
  tipo: string;
  color: string;
  talla: string;
  origen: "ALMACEN" | "DISFRAZ";
  disfrazId: string;
  disfrazNombre: string;
}

export interface InfoDonante {
  id: string;
  nombre: string;
  estado: string;
  disponiblesFamilia: number;
}

export interface PiezaElegida {
  huecoId: string;
  etiqueta: string;
  tipo: string;
  obligatoria: boolean;
  prendaId: string;
  nombre: string;
  color: string;
  talla: string;
  origen: "ALMACEN" | "DISFRAZ";
  disfrazOrigenId: string;
  disfrazOrigenNombre: string;
}

export interface HuecoSinCubrir {
  huecoId: string;
  etiqueta: string;
  tipo: string;
  obligatoria: boolean;
  tallaPedida: string;
  motivo: string;
  tallasDisponibles: string[];
}

export interface DisfrazAfectado {
  id: string;
  nombre: string;
  estadoAntes: string;
  pierdeDisponibilidad: boolean; // estaba disponible y quedará incompleto
  piezasTomadas: number;
}

export interface Armado {
  piezas: PiezaElegida[];
  omitidas: HuecoSinCubrir[]; // huecos opcionales que no se pudieron cubrir
  faltantes: HuecoSinCubrir[]; // huecos obligatorios que no se pudieron cubrir
  completo: boolean;
  piezasDeOtros: number;
  disfracesAfectados: DisfrazAfectado[];
}

export interface PropuestaArmado extends Armado {
  receta: { id: string; nombre: string; precioDia: number; activa: boolean };
  tallas: TallasPedido;
  opciones: OpcionHueco[];
}

interface EntradaElegir {
  huecos: HuecoEntrada[];
  tallas: TallasPedido;
  almacen: PiezaCandidata[];
  donantes: PiezaCandidata[];
  infoDonantes: Map<string, InfoDonante>;
  maxDeOtros?: number;
}

// ---------- Tallas ----------

function tallaDeHueco(h: HuecoEntrada, t: TallasPedido): string {
  const cat = categoriaTalla(h.tipo);
  if (cat === "UNICA") return TALLA_UNICA;
  const ajuste = t.ajustes?.[h.id];
  if (ajuste) return normalizarTalla(h.tipo, ajuste);
  return normalizarTalla(h.tipo, (cat === "CALZADO" ? t.calzado : t.ropa) ?? "");
}

// Devuelve la lista de problemas (vacía si las tallas sirven para esta receta).
export function validarTallas(huecos: HuecoEntrada[], tallas: TallasPedido): string[] {
  const errores: string[] = [];
  const ajustes = tallas.ajustes ?? {};

  const requiere = (categoria: string) => huecos.some((h) => categoriaTalla(h.tipo) === categoria && !ajustes[h.id]);

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

  for (const [huecoId, talla] of Object.entries(ajustes)) {
    const hueco = huecos.find((h) => h.id === huecoId);
    if (!hueco) {
      errores.push("Hay un ajuste de talla para una pieza que no está en esta receta.");
      continue;
    }
    if (categoriaTalla(hueco.tipo) === "UNICA") {
      errores.push(`«${hueco.etiqueta}» es de talla única: no admite ajuste.`);
      continue;
    }
    if (!tallaValida(hueco.tipo, normalizarTalla(hueco.tipo, talla))) {
      errores.push(`La talla «${talla}» no es válida para «${hueco.etiqueta}».`);
    }
  }

  return errores;
}

// Tallas con existencias para cada hueco (sin importar la talla elegida): sirven para que la
// pantalla del ajuste por pieza solo ofrezca tallas que existen. Los huecos opcionales solo
// cuentan con el almacén, igual que en el armado.
export interface OpcionHueco {
  huecoId: string;
  etiqueta: string;
  tipo: string;
  categoria: string;
  tallas: string[];
}

export function opcionesPorHueco(
  huecos: HuecoEntrada[],
  almacen: PiezaCandidata[],
  donantes: PiezaCandidata[]
): OpcionHueco[] {
  return huecos.map((h) => {
    const piezas = [...almacen, ...(h.obligatoria ? donantes : [])].filter((p) => cumpleHueco(p, h));
    const tallas = Array.from(new Set(piezas.map((p) => p.talla))).sort(
      (a, b) => ordenTalla(h.tipo, a) - ordenTalla(h.tipo, b)
    );
    return { huecoId: h.id, etiqueta: h.etiqueta, tipo: h.tipo, categoria: categoriaTalla(h.tipo), tallas };
  });
}

// ---------- Selección de piezas (cálculo puro, sin base de datos) ----------

export function elegirPiezas(entrada: EntradaElegir): Armado {
  const { huecos, tallas, almacen, donantes, infoDonantes } = entrada;
  const max = entrada.maxDeOtros ?? MAX_PIEZAS_DE_OTROS_DISFRACES;

  const tallaDe = new Map(huecos.map((h) => [h.id, tallaDeHueco(h, tallas)] as const));
  const usadas = new Set<string>();
  const tomadas = new Map<string, { nombre: string; piezas: number }>();
  let piezasDeOtros = 0;

  const piezas: PiezaElegida[] = [];
  const omitidas: HuecoSinCubrir[] = [];
  const faltantes: HuecoSinCubrir[] = [];

  // Piezas libres de una lista que cumplen el hueco Y la talla pedida.
  const coinciden = (h: HuecoEntrada, lista: PiezaCandidata[]) =>
    lista.filter((p) => !usadas.has(p.id) && p.talla === tallaDe.get(h.id) && cumpleHueco(p, h));

  const indiceColor = (h: HuecoEntrada, p: PiezaCandidata) => {
    if (h.colores.length === 0) return 0;
    const i = h.colores.map(normalizar).indexOf(normalizar(p.color));
    return i === -1 ? 99 : i;
  };

  // Huecos obligatorios que el almacén no puede cubrir: dependen de donantes.
  const pendientes = new Set(
    huecos.filter((h) => h.obligatoria && coinciden(h, almacen).length === 0).map((h) => h.id)
  );

  // Cuántos de esos huecos pendientes podría cubrir un mismo disfraz donante.
  const cobertura = (disfrazId: string) =>
    huecos.filter((h) => pendientes.has(h.id) && coinciden(h, donantes).some((p) => p.disfrazId === disfrazId)).length;

  // 0 = tomar de este disfraz no cuesta una venta más (ya está incompleto, o ya se está usando).
  const costo = (p: PiezaCandidata) => {
    if (tomadas.has(p.disfrazId)) return 0;
    const info = infoDonantes.get(p.disfrazId);
    return info && info.estado !== "DISPONIBLE" ? 0 : 1;
  };

  const compararDonantes = (h: HuecoEntrada) => (a: PiezaCandidata, b: PiezaCandidata) =>
    costo(a) - costo(b) ||
    cobertura(b.disfrazId) - cobertura(a.disfrazId) ||
    indiceColor(h, a) - indiceColor(h, b) ||
    (infoDonantes.get(b.disfrazId)?.disponiblesFamilia ?? 0) - (infoDonantes.get(a.disfrazId)?.disponiblesFamilia ?? 0) ||
    a.disfrazNombre.localeCompare(b.disfrazNombre, "es", { numeric: true }) ||
    a.id.localeCompare(b.id);

  // Obligatorios primero y, dentro de cada grupo, los de menor oferta: así un hueco no se
  // queda con la única pieza que otro necesitaba.
  const oferta = new Map(huecos.map((h) => [h.id, coinciden(h, almacen).length + coinciden(h, donantes).length] as const));
  const orden = [...huecos].sort(
    (a, b) =>
      Number(b.obligatoria) - Number(a.obligatoria) ||
      oferta.get(a.id)! - oferta.get(b.id)! ||
      a.etiqueta.localeCompare(b.etiqueta, "es")
  );

  for (const h of orden) {
    const talla = tallaDe.get(h.id)!;

    let elegida: PiezaCandidata | undefined = coinciden(h, almacen).sort(
      (a, b) => indiceColor(h, a) - indiceColor(h, b) || a.id.localeCompare(b.id)
    )[0];

    if (!elegida && h.obligatoria && piezasDeOtros < max) {
      elegida = coinciden(h, donantes).sort(compararDonantes(h))[0];
    }

    if (elegida) {
      usadas.add(elegida.id);
      if (elegida.origen === "DISFRAZ") {
        piezasDeOtros++;
        const previo = tomadas.get(elegida.disfrazId);
        tomadas.set(elegida.disfrazId, { nombre: elegida.disfrazNombre, piezas: (previo?.piezas ?? 0) + 1 });
      }
      piezas.push({
        huecoId: h.id,
        etiqueta: h.etiqueta,
        tipo: h.tipo,
        obligatoria: h.obligatoria,
        prendaId: elegida.id,
        nombre: elegida.nombre,
        color: elegida.color,
        talla: elegida.talla,
        origen: elegida.origen,
        disfrazOrigenId: elegida.disfrazId,
        disfrazOrigenNombre: elegida.disfrazNombre,
      });
    } else {
      // Por qué no se pudo: sin piezas de ese tipo, sin esa talla, o tope de préstamos.
      const existentes = [
        ...almacen.filter((p) => cumpleHueco(p, h)),
        ...(h.obligatoria ? donantes.filter((p) => cumpleHueco(p, h)) : []),
      ].filter((p) => !usadas.has(p.id));

      const tallasDisponibles = Array.from(new Set(existentes.map((p) => p.talla))).sort(
        (a, b) => ordenTalla(h.tipo, a) - ordenTalla(h.tipo, b)
      );
      const esUnica = categoriaTalla(h.tipo) === "UNICA";

      let motivo: string;
      if (existentes.length === 0) {
        motivo = `No hay «${h.etiqueta}» disponible.`;
      } else if (!esUnica && !tallasDisponibles.includes(talla)) {
        motivo = `No hay «${h.etiqueta}» en talla ${talla}. Hay en: ${tallasDisponibles.join(", ")}.`;
      } else if (h.obligatoria && piezasDeOtros >= max && coinciden(h, donantes).length > 0) {
        motivo = `Para «${h.etiqueta}» habría que tomar otra pieza de otro disfraz, y el máximo es ${max}.`;
      } else {
        motivo = `Ya no quedan piezas disponibles para «${h.etiqueta}».`;
      }

      (h.obligatoria ? faltantes : omitidas).push({
        huecoId: h.id,
        etiqueta: h.etiqueta,
        tipo: h.tipo,
        obligatoria: h.obligatoria,
        tallaPedida: talla,
        motivo,
        tallasDisponibles,
      });
    }

    pendientes.delete(h.id);
  }

  // Salida en el orden original de la receta.
  const posicion = new Map(huecos.map((h, i) => [h.id, i] as const));
  const porHueco = <T extends { huecoId: string }>(a: T, b: T) => posicion.get(a.huecoId)! - posicion.get(b.huecoId)!;
  piezas.sort(porHueco);
  omitidas.sort(porHueco);
  faltantes.sort(porHueco);

  const disfracesAfectados: DisfrazAfectado[] = Array.from(tomadas.entries()).map(([id, t]) => {
    const info = infoDonantes.get(id);
    return {
      id,
      nombre: t.nombre,
      estadoAntes: info?.estado ?? "DISPONIBLE",
      pierdeDisponibilidad: info ? info.estado === "DISPONIBLE" : true,
      piezasTomadas: t.piezas,
    };
  });

  return { piezas, omitidas, faltantes, completo: faltantes.length === 0, piezasDeOtros, disfracesAfectados };
}

// ---------- Lectura de existencias ----------

async function cargarExistencias(tipos: string[]) {
  const [prendas, estados, reservas] = await Promise.all([
    prisma.prenda.findMany({
      where: {
        tipo: { in: tipos as TipoPrenda[] },
        estado: "DISPONIBLE",
        calidad: { not: "baja" },
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
        disfrazHogar: { select: { id: true, nombre: true, origen: true } },
      },
    }),
    estadosDeDisfraces(),
    // Un disfraz con una reserva activa está apartado: no se le toca ninguna pieza.
    // (La parte 4 libera las reservas vencidas antes de llamar a este motor.)
    prisma.reserva.findMany({ where: { liberadaEn: null }, select: { disfrazFisicoId: true } }),
  ]);

  const enReserva = new Set(reservas.map((r) => r.disfrazFisicoId));
  const estadoPorId = new Map(estados.map((e) => [e.id, e] as const));

  // Cuántas instancias disponibles tiene cada familia: protege a las familias con pocas.
  const disponiblesPorFamilia = new Map<string, number>();
  for (const e of estados) {
    if (e.estado !== "DISPONIBLE") continue;
    const clave = e.familia ?? e.id;
    disponiblesPorFamilia.set(clave, (disponiblesPorFamilia.get(clave) ?? 0) + 1);
  }

  const almacen: PiezaCandidata[] = [];
  const donantes: PiezaCandidata[] = [];
  const infoDonantes = new Map<string, InfoDonante>();

  for (const p of prendas) {
    if (p.disfrazActualId !== p.disfrazHogarId) continue; // está prestada: no está en su sitio

    const base = {
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo as string,
      color: p.color,
      talla: p.talla,
      disfrazId: p.disfrazHogar.id,
      disfrazNombre: p.disfrazHogar.nombre,
    };

    if (p.disfrazHogar.origen === "ALMACEN") {
      almacen.push({ ...base, origen: "ALMACEN" });
      continue;
    }

    // Donantes: solo disfraces del catálogo disponibles o ya incompletos. Nunca los
    // alquilados, en lavado, en reparación o con reserva activa.
    const estado = estadoPorId.get(p.disfrazHogarId);
    if (!estado || !["DISPONIBLE", "INCOMPLETO"].includes(estado.estado)) continue;
    if (enReserva.has(p.disfrazHogarId)) continue;

    donantes.push({ ...base, origen: "DISFRAZ" });
    infoDonantes.set(estado.id, {
      id: estado.id,
      nombre: estado.nombre,
      estado: estado.estado,
      disponiblesFamilia: disponiblesPorFamilia.get(estado.familia ?? estado.id) ?? 0,
    });
  }

  return { almacen, donantes, infoDonantes };
}

// ---------- Propuesta completa (lee la base de datos, no escribe nada) ----------

export async function proponerArmado(recetaId: string, tallas: TallasPedido): Promise<PropuestaArmado> {
  await liberarReservasVencidas();

  const receta = await prisma.receta.findUnique({ where: { id: recetaId }, include: { piezas: true } });
  if (!receta) throw new ErrorArmado("Receta no encontrada", 404);

  const huecos: HuecoEntrada[] = receta.piezas
    .map((p) => ({
      id: p.id,
      etiqueta: p.etiqueta,
      tipo: p.tipo as string,
      colores: p.colores,
      nombreContiene: p.nombreContiene,
      obligatoria: p.obligatoria,
    }))
    .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.etiqueta.localeCompare(b.etiqueta, "es"));

  const errores = validarTallas(huecos, tallas);
  if (errores.length > 0) throw new ErrorArmado(errores.join(" "), 400);

  const existencias = await cargarExistencias(Array.from(new Set(huecos.map((h) => h.tipo))));
  const armado = elegirPiezas({ huecos, tallas, ...existencias });

  return {
    ...armado,
    receta: { id: receta.id, nombre: receta.nombre, precioDia: Number(receta.precioDia), activa: receta.activa },
    tallas,
    opciones: opcionesPorHueco(huecos, existencias.almacen, existencias.donantes),
  };
}