import type { Promocion } from "@prisma/client";
import { prisma } from "../../config/prisma";

// Fuente única de precios: el carrito, Stripe y el alquiler guardado usan este mismo
// cálculo, en céntimos enteros, para que lo mostrado y lo cobrado nunca difieran.

export const PORCENTAJE_GARANTIA = 25;

const MS_POR_DIA = 86_400_000;
const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MAX_DETALLE = 450; // Stripe limita cada valor de metadata a 500 caracteres

export class ErrorCotizacion extends Error {
  constructor(mensaje: string, public readonly estado: number = 400) {
    super(mensaje);
  }
}

export interface EntradaCotizacion {
  disfraces: string[];
  fechaInicio: string;
  fechaFin: string;
  codigo?: string;
}

interface DisfrazParaPrecio {
  id: string;
  nombre: string;
  tipoDisfraz: string;
  temporadaEvento: string;
  precioAlquiler: unknown;
}

export interface LineaCotizacion {
  disfrazId: string;
  nombre: string;
  tipoDisfraz: string;
  precioDia: number;
  dias: number;
  subtotal: number; // sin descuento
  descuento: number;
  total: number; // con descuento
  promocion: { id: string; nombre: string; porcentaje: number; codigo: string | null } | null;
}

// valido  = el código se puede usar con este carrito
// aplicado = efectivamente redujo el precio de al menos un disfraz
export interface EstadoCodigo {
  codigo: string;
  valido: boolean;
  aplicado: boolean;
  mensaje: string;
}

export interface Cotizacion {
  dias: number;
  lineas: LineaCotizacion[];
  subtotal: number; // sin descuento
  descuento: number;
  totalAlquiler: number; // con descuento: es el montoTotal que se guarda en el alquiler
  garantia: number; // 25% de totalAlquiler
  totalAPagar: number;
  detalleDescuento: string | null;
  codigo: EstadoCodigo | null;
  centavos: {
    lineas: number[]; // total de cada disfraz, en el mismo orden que `lineas`
    descuento: number;
    totalAlquiler: number;
    garantia: number;
    totalAPagar: number;
  };
}

export function normalizarCodigo(codigo?: string | null): string | null {
  const limpio = codigo?.trim().toUpperCase();
  return limpio ? limpio : null;
}

function hoyUTC(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}

function parsearFecha(texto: string, campo: string): Date {
  const fecha = new Date(texto);
  if (!texto || Number.isNaN(fecha.getTime())) {
    throw new ErrorCotizacion(`La fecha de ${campo} no es válida.`);
  }
  return fecha;
}

// Mínimo 1 día: una fecha de inicio igual a la de fin cuenta como 1 día.
export function calcularDias(inicio: Date, fin: Date): number {
  return Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / MS_POR_DIA));
}

// --- Reglas de las promociones ---

interface Contexto {
  dias: number;
  diaSemana: number; // día de la semana de la fecha de inicio (0 = domingo)
}

function vigente(p: Promocion, hoy: Date): boolean {
  if (!p.activa) return false;
  if (p.vigenteDesde && hoy < p.vigenteDesde) return false;
  if (p.vigenteHasta && hoy > p.vigenteHasta) return false;
  return true;
}

function cumpleCondicionesGenerales(p: Promocion, ctx: Contexto): boolean {
  if (p.minDias != null && ctx.dias < p.minDias) return false;
  if (p.diasSemana.length > 0 && !p.diasSemana.includes(ctx.diaSemana)) return false;
  return true;
}

function aplicaAlDisfraz(p: Promocion, d: DisfrazParaPrecio): boolean {
  if (p.tipoDisfraz && p.tipoDisfraz.toLowerCase() !== d.tipoDisfraz.toLowerCase()) return false;
  if (p.temporadaEvento && p.temporadaEvento.toLowerCase() !== d.temporadaEvento.toLowerCase()) return false;
  return true;
}

// Mayor porcentaje primero; a igualdad, la automática antes que la de código;
// y por nombre para que el resultado sea siempre el mismo.
function compararPromos(a: Promocion, b: Promocion): number {
  return (
    b.porcentaje - a.porcentaje ||
    Number(a.codigo !== null) - Number(b.codigo !== null) ||
    a.nombre.localeCompare(b.nombre, "es")
  );
}

function evaluarCodigo(
  codigo: string,
  promociones: Promocion[],
  hoy: Date,
  ctx: Contexto,
  disfraces: DisfrazParaPrecio[],
  lineas: LineaCotizacion[]
): EstadoCodigo {
  const promo = promociones.find((p) => normalizarCodigo(p.codigo) === codigo && vigente(p, hoy));
  if (!promo) {
    return { codigo, valido: false, aplicado: false, mensaje: "El código no existe o ya no está vigente." };
  }

  if (promo.minDias != null && ctx.dias < promo.minDias) {
    return {
      codigo,
      valido: false,
      aplicado: false,
      mensaje: `El código ${codigo} requiere alquilar al menos ${promo.minDias} días.`,
    };
  }

  if (promo.diasSemana.length > 0 && !promo.diasSemana.includes(ctx.diaSemana)) {
    const dias = promo.diasSemana.map((d) => NOMBRE_DIA[d]).join(" o ");
    return {
      codigo,
      valido: false,
      aplicado: false,
      mensaje: `El código ${codigo} solo vale para alquileres que empiezan en ${dias}.`,
    };
  }

  const cubiertos = disfraces.filter((d) => aplicaAlDisfraz(promo, d)).length;
  if (cubiertos === 0) {
    const partes: string[] = [];
    if (promo.tipoDisfraz) partes.push(`de tipo ${promo.tipoDisfraz}`);
    if (promo.temporadaEvento) partes.push(`de la temporada ${promo.temporadaEvento}`);
    return {
      codigo,
      valido: false,
      aplicado: false,
      mensaje: `El código ${codigo} solo aplica a disfraces ${partes.join(" y ")}.`,
    };
  }

  const aplicados = lineas.filter((l) => l.promocion?.id === promo.id).length;
  if (aplicados === 0) {
    return {
      codigo,
      valido: true,
      aplicado: false,
      mensaje: `El código ${codigo} es válido, pero tu carrito ya tiene una oferta igual o mejor. Las ofertas no se acumulan.`,
    };
  }

  const sufijo = aplicados < disfraces.length ? ` en ${aplicados} de ${disfraces.length} disfraces` : "";
  return {
    codigo,
    valido: true,
    aplicado: true,
    mensaje: `Código ${codigo} aplicado: ${promo.porcentaje}% de descuento${sufijo}.`,
  };
}

function detalleDe(lineas: LineaCotizacion[]): string | null {
  const vistos = new Map<string, string>();
  for (const l of lineas) {
    if (!l.promocion) continue;
    const { id, nombre, porcentaje, codigo } = l.promocion;
    vistos.set(id, `${nombre} (${porcentaje}%${codigo ? `, código ${codigo}` : ""})`);
  }
  if (vistos.size === 0) return null;
  const texto = Array.from(vistos.values()).join(" · ");
  return texto.length > MAX_DETALLE ? `${texto.slice(0, MAX_DETALLE - 1)}…` : texto;
}

// Cálculo puro (sin base de datos): se puede probar con datos de ejemplo.
// Por cada disfraz se aplica la MEJOR oferta que le corresponde (las ofertas no se acumulan).
export function calcularCotizacion(
  disfraces: DisfrazParaPrecio[],
  inicio: Date,
  fin: Date,
  promociones: Promocion[],
  codigo: string | null,
  hoy: Date = hoyUTC()
): Cotizacion {
  const dias = calcularDias(inicio, fin);
  const ctx: Contexto = { dias, diaSemana: inicio.getUTCDay() };

  // Automáticas, más la del código si el cliente ingresó uno.
  const candidatas = promociones.filter((p) => {
    if (!vigente(p, hoy)) return false;
    const codigoPromo = normalizarCodigo(p.codigo);
    return codigoPromo === null || codigoPromo === codigo;
  });
  const elegibles = candidatas.filter((p) => cumpleCondicionesGenerales(p, ctx));

  const internas = disfraces.map((d) => {
    const promo = elegibles.filter((p) => aplicaAlDisfraz(p, d)).sort(compararPromos)[0] ?? null;
    const precioCent = Math.round(Number(d.precioAlquiler) * 100);
    const brutoCent = precioCent * dias;
    const porcentaje = promo ? Math.min(100, Math.max(0, promo.porcentaje)) : 0;
    const descuentoCent = Math.round((brutoCent * porcentaje) / 100);
    return { d, promo, precioCent, brutoCent, descuentoCent, netoCent: brutoCent - descuentoCent };
  });

  const lineas: LineaCotizacion[] = internas.map((i) => ({
    disfrazId: i.d.id,
    nombre: i.d.nombre,
    tipoDisfraz: i.d.tipoDisfraz,
    precioDia: i.precioCent / 100,
    dias,
    subtotal: i.brutoCent / 100,
    descuento: i.descuentoCent / 100,
    total: i.netoCent / 100,
    promocion: i.promo
      ? { id: i.promo.id, nombre: i.promo.nombre, porcentaje: i.promo.porcentaje, codigo: normalizarCodigo(i.promo.codigo) }
      : null,
  }));

  const brutoTotal = internas.reduce((s, i) => s + i.brutoCent, 0);
  const descuentoTotal = internas.reduce((s, i) => s + i.descuentoCent, 0);
  const netoTotal = brutoTotal - descuentoTotal;
  const garantiaCent = Math.round((netoTotal * PORCENTAJE_GARANTIA) / 100);
  const totalCent = netoTotal + garantiaCent;

  return {
    dias,
    lineas,
    subtotal: brutoTotal / 100,
    descuento: descuentoTotal / 100,
    totalAlquiler: netoTotal / 100,
    garantia: garantiaCent / 100,
    totalAPagar: totalCent / 100,
    detalleDescuento: detalleDe(lineas),
    codigo: codigo ? evaluarCodigo(codigo, promociones, hoy, ctx, disfraces, lineas) : null,
    centavos: {
      lineas: internas.map((i) => i.netoCent),
      descuento: descuentoTotal,
      totalAlquiler: netoTotal,
      garantia: garantiaCent,
      totalAPagar: totalCent,
    },
  };
}

// Cotización completa: valida la entrada y lee disfraces y promociones de la base de datos.
export async function cotizar(entrada: EntradaCotizacion): Promise<Cotizacion> {
  if (entrada.disfraces.length === 0) {
    throw new ErrorCotizacion("El carrito está vacío.");
  }
  if (new Set(entrada.disfraces).size !== entrada.disfraces.length) {
    throw new ErrorCotizacion("El carrito tiene disfraces repetidos.");
  }

  const inicio = parsearFecha(entrada.fechaInicio, "inicio");
  const fin = parsearFecha(entrada.fechaFin, "fin");
  if (fin < inicio) {
    throw new ErrorCotizacion("La fecha de fin no puede ser anterior a la de inicio.");
  }

  const encontrados = await prisma.disfrazFisico.findMany({
    where: { id: { in: entrada.disfraces } },
    select: { id: true, nombre: true, tipoDisfraz: true, temporadaEvento: true, precioAlquiler: true },
  });
  if (encontrados.length !== entrada.disfraces.length) {
    throw new ErrorCotizacion("Alguno de los disfraces del carrito ya no existe.", 404);
  }

  // Se conserva el orden del carrito.
  const disfraces = entrada.disfraces.map((id) => encontrados.find((d) => d.id === id)!);
  const promociones = await prisma.promocion.findMany({ where: { activa: true } });

  return calcularCotizacion(disfraces, inicio, fin, promociones, normalizarCodigo(entrada.codigo));
}

// Ofertas automáticas vigentes, para mostrarlas en el catálogo. Los cupones con código
// no se listan: se comparten aparte.
export async function listarOfertasVigentes() {
  const hoy = hoyUTC();
  const promos = await prisma.promocion.findMany({
    where: { activa: true, codigo: null },
    orderBy: [{ porcentaje: "desc" }, { nombre: "asc" }],
  });
  return promos
    .filter((p) => vigente(p, hoy))
    .map((p) => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, porcentaje: p.porcentaje }));
}