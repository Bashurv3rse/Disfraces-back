import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { categoriaTalla, normalizarTalla, ordenTalla } from "../../common/tallas";
import type { AgregarPiezasInput, RetirarPiezasInput } from "./almacen.schema";
import { liberarReservasVencidas } from "../a-medida/reservas.base";

export class ErrorAlmacen extends Error {
  constructor(mensaje: string, public readonly estado: number = 400) {
    super(mensaje);
  }
}

const NOMBRE_ALMACEN = "Almacén de piezas sueltas";

// El almacén es un «disfraz» especial que guarda las piezas sueltas. Se crea solo si falta,
// así el admin puede empezar aunque no haya corrido la seed.
async function asegurarAlmacen() {
  const existente = await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" } });
  if (existente) return existente;
  return prisma.disfrazFisico.create({
    data: {
      nombre: NOMBRE_ALMACEN,
      tipoDisfraz: "Almacén",
      temporadaEvento: "almacen",
      precioAlquiler: 0,
      origen: "ALMACEN",
    },
  });
}

export interface TallaStock {
  talla: string;
  total: number;
  disponibles: number; // en el almacén y en buen estado
  enUso: number; // prestadas hoy a otro disfraz
  danadas: number; // en el almacén pero dañadas, faltantes o dadas de baja
}

export interface GrupoAlmacen {
  clave: string;
  nombre: string;
  tipo: string;
  color: string;
  categoriaTalla: string;
  tallas: TallaStock[];
  totalDisponibles: number;
}

export async function listarAlmacen() {
  await liberarReservasVencidas();
  const resumen = { total: 0, disponibles: 0, enUso: 0, danadas: 0 };

  const almacen = await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" }, select: { id: true } });
  if (!almacen) return { resumen, grupos: [] as GrupoAlmacen[] };

  const prendas = await prisma.prenda.findMany({
    where: { disfrazHogarId: almacen.id },
    select: { nombre: true, tipo: true, color: true, talla: true, estado: true, disfrazActualId: true },
  });

  const mapa = new Map<string, GrupoAlmacen>();

  for (const p of prendas) {
    const clave = `${p.tipo}|${p.nombre.toLowerCase()}|${p.color.toLowerCase()}`;
    let grupo = mapa.get(clave);
    if (!grupo) {
      grupo = {
        clave,
        nombre: p.nombre,
        tipo: p.tipo,
        color: p.color,
        categoriaTalla: categoriaTalla(p.tipo),
        tallas: [],
        totalDisponibles: 0,
      };
      mapa.set(clave, grupo);
    }

    let talla = grupo.tallas.find((t) => t.talla === p.talla);
    if (!talla) {
      talla = { talla: p.talla, total: 0, disponibles: 0, enUso: 0, danadas: 0 };
      grupo.tallas.push(talla);
    }

    talla.total++;
    resumen.total++;

    if (p.disfrazActualId !== almacen.id) {
      talla.enUso++;
      resumen.enUso++;
    } else if (p.estado === "DISPONIBLE") {
      talla.disponibles++;
      grupo.totalDisponibles++;
      resumen.disponibles++;
    } else {
      talla.danadas++;
      resumen.danadas++;
    }
  }

  const grupos = Array.from(mapa.values())
    .map((g) => ({ ...g, tallas: g.tallas.sort((a, b) => ordenTalla(g.tipo, a.talla) - ordenTalla(g.tipo, b.talla)) }))
    .sort(
      (a, b) =>
        a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, "es") || a.color.localeCompare(b.color, "es")
    );

  return { resumen, grupos };
}

export async function agregarPiezas(datos: AgregarPiezasInput) {
  const almacen = await asegurarAlmacen();
  const color = datos.color.trim().toLowerCase();

  // Si la pieza ya existe escrita con otras mayúsculas, se reutiliza su escritura para no duplicar grupos.
  const existente = await prisma.prenda.findFirst({
    where: {
      disfrazHogarId: almacen.id,
      tipo: datos.tipo,
      nombre: { equals: datos.nombre, mode: "insensitive" },
      color: { equals: color, mode: "insensitive" },
    },
    select: { nombre: true, color: true },
  });
  const nombre = existente?.nombre ?? datos.nombre;
  const colorFinal = existente?.color ?? color;

  const filas: Prisma.PrendaCreateManyInput[] = [];
  for (const t of datos.tallas) {
    const talla = normalizarTalla(datos.tipo, t.talla);
    for (let i = 0; i < t.cantidad; i++) {
      filas.push({
        nombre,
        tipo: datos.tipo,
        color: colorFinal,
        talla,
        disfrazHogarId: almacen.id,
        disfrazActualId: almacen.id,
      });
    }
  }

  await prisma.prenda.createMany({ data: filas });
  return { agregadas: filas.length };
}

// Retira unidades del almacén. Las piezas sin historial se eliminan; las que ya participaron
// en algún movimiento, devolución o sustitución no se pueden borrar sin romper ese historial,
// así que se dan de baja (quedan como dañadas con calidad «baja» y nunca se usan).
export async function retirarPiezas(datos: RetirarPiezasInput) {
  const almacen = await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" }, select: { id: true } });
  if (!almacen) throw new ErrorAlmacen("El almacén todavía no tiene piezas.", 404);

  const talla = normalizarTalla(datos.tipo, datos.talla);

  const candidatas = await prisma.prenda.findMany({
    where: {
      disfrazHogarId: almacen.id,
      tipo: datos.tipo,
      nombre: { equals: datos.nombre, mode: "insensitive" },
      color: { equals: datos.color, mode: "insensitive" },
      talla,
    },
    select: {
      id: true,
      estado: true,
      calidad: true,
      disfrazActualId: true,
      _count: { select: { movimientos: true, devolucionItems: true, proveedores: true, sustitucionesSalida: true } },
    },
  });

  const conHistorial = (p: (typeof candidatas)[number]) =>
    p._count.movimientos + p._count.devolucionItems + p._count.proveedores + p._count.sustitucionesSalida > 0;

  // Solo piezas que están hoy en el almacén y no se dieron de baja. Primero las dañadas,
  // luego las que se pueden eliminar sin historial.
  const elegidas = candidatas
    .filter((p) => p.disfrazActualId === almacen.id && p.calidad !== "baja")
    .sort(
      (a, b) =>
        Number(a.estado === "DISPONIBLE") - Number(b.estado === "DISPONIBLE") ||
        Number(conHistorial(a)) - Number(conHistorial(b))
    )
    .slice(0, datos.cantidad);

  if (elegidas.length === 0) {
    throw new ErrorAlmacen("No hay piezas que se puedan retirar: no hay unidades en el almacén para esa talla.", 409);
  }

  const aEliminar = elegidas.filter((p) => !conHistorial(p)).map((p) => p.id);
  const aDarDeBaja = elegidas.filter(conHistorial).map((p) => p.id);

  await prisma.$transaction([
    prisma.prenda.deleteMany({ where: { id: { in: aEliminar } } }),
    prisma.prenda.updateMany({ where: { id: { in: aDarDeBaja } }, data: { estado: "DANADA", calidad: "baja" } }),
  ]);

  return {
    solicitadas: datos.cantidad,
    retiradas: elegidas.length,
    eliminadas: aEliminar.length,
    deBaja: aDarDeBaja.length,
  };
}