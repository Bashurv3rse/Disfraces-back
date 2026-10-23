import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { normalizar } from "../../common/texto";
import type { RecetaInput } from "./recetas.schema";
import { liberarReservasVencidas } from "../a-medida/reservas.base";

export class ErrorReceta extends Error {
  constructor(mensaje: string, public readonly estado: number = 400) {
    super(mensaje);
  }
}

export interface HuecoReceta {
  tipo: string;
  colores: string[];
  nombreContiene: string | null;
}

export interface PiezaStock {
  nombre: string;
  tipo: string;
  color: string;
}

// Una pieza cumple un hueco si coincide el tipo, el color (cuando el hueco lista colores)
// y el nombre (cuando el hueco pide una palabra). Se exporta: el motor de armado la reutiliza.
export function cumpleHueco(pieza: PiezaStock, hueco: HuecoReceta): boolean {
  if (pieza.tipo !== hueco.tipo) return false;
  if (hueco.colores.length > 0 && !hueco.colores.map(normalizar).includes(normalizar(pieza.color))) return false;
  if (hueco.nombreContiene && !normalizar(pieza.nombre).includes(normalizar(hueco.nombreContiene))) return false;
  return true;
}

// De la cabeza a los pies, para mostrar los huecos en un orden natural.
const ORDEN_TIPOS = ["SOMBRERO", "PANUELO", "ABRIGO", "CHALECO", "CAMISA", "FALDA", "PANTALON", "ZAPATO", "TACON", "ACCESORIO"];

async function piezasDisponiblesDelAlmacen(): Promise<PiezaStock[]> {
  const almacen = await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" }, select: { id: true } });
  if (!almacen) return [];

  const prendas = await prisma.prenda.findMany({
    where: { disfrazHogarId: almacen.id, estado: "DISPONIBLE" },
    select: { nombre: true, tipo: true, color: true, disfrazActualId: true },
  });
  return prendas.filter((p) => p.disfrazActualId === almacen.id);
}

function preparar(datos: RecetaInput) {
  const palabrasClave = Array.from(new Set(datos.palabrasClave.map(normalizar).filter(Boolean)));
  if (palabrasClave.length === 0) throw new ErrorReceta("Agrega al menos una palabra clave válida.");

  return {
    nombre: datos.nombre,
    descripcion: datos.descripcion || null,
    palabrasClave,
    precioDia: datos.precioDia,
    activa: datos.activa,
    piezas: datos.piezas.map((p) => ({
      etiqueta: p.etiqueta,
      tipo: p.tipo,
      colores: Array.from(new Set(p.colores.map((c) => c.trim().toLowerCase()).filter(Boolean))),
      nombreContiene: p.nombreContiene?.trim() || null,
      obligatoria: p.obligatoria,
    })),
  };
}

// Una palabra clave no puede estar en dos recetas: haría ambigua la búsqueda del cliente.
async function validarPalabrasClave(palabras: string[], excluirId?: string) {
  const otras = await prisma.receta.findMany({
    where: excluirId ? { id: { not: excluirId } } : {},
    select: { nombre: true, palabrasClave: true },
  });
  for (const palabra of palabras) {
    const duena = otras.find((r) => r.palabrasClave.includes(palabra));
    if (duena) throw new ErrorReceta(`La palabra clave «${palabra}» ya pertenece a la receta «${duena.nombre}».`, 409);
  }
}

function traducirError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ErrorReceta("Ya existe una receta con ese nombre.", 409);
  }
  throw error;
}

// Al crear o editar una receta, los pedidos antiguos que pedían justo eso (y habían quedado «sin
// receta») se ligan a ella y se marcan como atendidos.
async function vincularPeticiones(recetaId: string, palabrasClave: string[]) {
  const claves = palabrasClave.map(normalizar).filter(Boolean);
  if (claves.length === 0) return 0;

  const pendientes = await prisma.peticionDisfraz.findMany({
    where: { recetaId: null },
    select: { id: true, textoNormalizado: true },
  });
  const ids = pendientes
    .filter((p) => claves.some((k) => ` ${p.textoNormalizado} `.includes(` ${k} `)))
    .map((p) => p.id);
  if (ids.length === 0) return 0;

  await prisma.peticionDisfraz.updateMany({ where: { id: { in: ids } }, data: { recetaId, atendida: true } });
  return ids.length;
}

export async function listarRecetas() {
  await liberarReservasVencidas();
  const [recetas, disponibles] = await Promise.all([
    prisma.receta.findMany({ include: { piezas: true }, orderBy: { nombre: "asc" } }),
    piezasDisponiblesDelAlmacen(),
  ]);

  return recetas.map((r) => {
    const piezas = r.piezas
      .map((p) => ({ ...p, stock: disponibles.filter((d) => cumpleHueco(d, p)).length }))
      .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo));
    // «Viable» = el almacén tiene al menos una pieza para cada hueco obligatorio.
    const viable = piezas.filter((p) => p.obligatoria).every((p) => p.stock > 0);
    return { ...r, piezas, viable };
  });
}

async function obtenerConStock(id: string) {
  const receta = (await listarRecetas()).find((r) => r.id === id);
  if (!receta) throw new ErrorReceta("Receta no encontrada", 404);
  return receta;
}

export async function crearReceta(datos: RecetaInput) {
  const d = preparar(datos);
  await validarPalabrasClave(d.palabrasClave);

  try {
    const creada = await prisma.receta.create({
      data: {
        nombre: d.nombre,
        descripcion: d.descripcion,
        palabrasClave: d.palabrasClave,
        precioDia: d.precioDia,
        activa: d.activa,
        piezas: { create: d.piezas },
      },
    });
    const vinculadas = d.activa ? await vincularPeticiones(creada.id, d.palabrasClave) : 0;
    return { ...(await obtenerConStock(creada.id)), peticionesVinculadas: vinculadas };
  } catch (error) {
    return traducirError(error);
  }
}

export async function actualizarReceta(id: string, datos: RecetaInput) {
  const existente = await prisma.receta.findUnique({ where: { id }, select: { id: true } });
  if (!existente) throw new ErrorReceta("Receta no encontrada", 404);

  const d = preparar(datos);
  await validarPalabrasClave(d.palabrasClave, id);

  try {
    await prisma.$transaction([
      prisma.recetaPieza.deleteMany({ where: { recetaId: id } }),
      prisma.receta.update({
        where: { id },
        data: {
          nombre: d.nombre,
          descripcion: d.descripcion,
          palabrasClave: d.palabrasClave,
          precioDia: d.precioDia,
          activa: d.activa,
          piezas: { create: d.piezas },
        },
      }),
    ]);
    const vinculadas = d.activa ? await vincularPeticiones(id, d.palabrasClave) : 0;
    return { ...(await obtenerConStock(id)), peticionesVinculadas: vinculadas };
  } catch (error) {
    return traducirError(error);
  }
}

export async function cambiarActiva(id: string, activa: boolean) {
  const existente = await prisma.receta.findUnique({ where: { id }, select: { id: true } });
  if (!existente) throw new ErrorReceta("Receta no encontrada", 404);
  await prisma.receta.update({ where: { id }, data: { activa } });
  return obtenerConStock(id);
}

export async function eliminarReceta(id: string) {
  const existente = await prisma.receta.findUnique({ where: { id }, select: { id: true } });
  if (!existente) throw new ErrorReceta("Receta no encontrada", 404);

  const reservas = await prisma.reserva.count({ where: { recetaId: id } });
  if (reservas > 0) {
    throw new ErrorReceta("Esta receta ya se usó en reservas: desactívala en vez de eliminarla.", 409);
  }

  // Las peticiones que la habían encontrado vuelven a quedar «sin receta».
  await prisma.$transaction([
    prisma.peticionDisfraz.updateMany({ where: { recetaId: id }, data: { recetaId: null, atendida: false } }),
    prisma.receta.delete({ where: { id } }),
  ]);
}