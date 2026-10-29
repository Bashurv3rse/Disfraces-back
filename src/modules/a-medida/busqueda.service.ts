import { prisma } from "../../config/prisma";
import { normalizar } from "../../common/texto";
import { categoriaTalla } from "../../common/tallas";
import { estadosDeDisfraces } from "../disfraces/disfraces.service";

export class ErrorBusqueda extends Error {
  constructor(mensaje: string, public readonly estado: number = 400) {
    super(mensaje);
  }
}

const ORDEN_TIPOS = ["SOMBRERO", "PANUELO", "ABRIGO", "CHALECO", "CAMISA", "FALDA", "PANTALON", "ZAPATO", "TACON", "ACCESORIO"];

// Palabras que no dicen QUÉ disfraz se quiere. «quiero un disfraz de bombero» → «bombero».
export const PALABRAS_VACIAS = new Set([
  "quiero", "quisiera", "queria", "necesito", "busco", "buscando", "me", "gustaria", "mi", "mis",
  "un", "una", "unos", "unas", "el", "la", "los", "las", "de", "del", "al", "a", "en", "con", "para",
  "por", "favor", "que", "y", "o", "como", "tipo", "hola", "buenas",
  "disfraz", "disfraces", "disfrazarme", "disfrazar", "disfrazado", "disfrazada",
  "traje", "trajes", "ropa", "vestirme", "vestir", "hacer", "armar", "armarme", "pedir",
]);

export function palabrasSignificativas(normalizado: string): string[] {
  return normalizado.split(" ").filter((t) => t && !PALABRAS_VACIAS.has(t));
}

// Distancia de Levenshtein: cuántas letras hay que cambiar, borrar o agregar para pasar de una palabra a otra.
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
    }
    previa = actual;
  }
  return previa[b.length];
}

// Errores de tipeo tolerados según el largo: ninguno hasta 3 letras, 1 hasta 6 y 2 desde 7.
function tolerancia(largo: number): number {
  return largo <= 3 ? 0 : largo <= 6 ? 1 : 2;
}

// Qué tan bien coincide un texto con las palabras clave de una receta:
//  100 = la palabra o frase clave aparece completa; 70-80 = parecida (error de tipeo); 0 = nada.
export function puntuar(textoNormalizado: string, tokens: string[], palabrasClave: string[]): number {
  const relleno = ` ${textoNormalizado} `;
  let mejor = 0;

  for (const clave of palabrasClave) {
    const k = normalizar(clave);
    if (!k) continue;

    if (relleno.includes(` ${k} `)) {
      mejor = Math.max(mejor, 100);
      continue;
    }

    // Las frases de varias palabras solo cuentan si aparecen completas.
    if (k.includes(" ")) continue;

    for (const t of tokens) {
      if (t.length < 4 || k.length < 4) continue; // las palabras cortas darían falsos positivos
      const d = distancia(t, k);
      if (d <= Math.min(tolerancia(t.length), tolerancia(k.length))) {
        mejor = Math.max(mejor, 80 - d * 10);
      }
    }
  }
  return mejor;
}

// ---------- Lo que se le muestra al cliente ----------

export interface RecetaPublica {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioDia: number;
  piezas: { id: string; etiqueta: string; tipo: string; categoriaTalla: string; obligatoria: boolean }[];
  pideTallaRopa: boolean;
  pideTallaCalzado: boolean;
}

async function cargarRecetasActivas() {
  return prisma.receta.findMany({ where: { activa: true }, include: { piezas: true }, orderBy: { nombre: "asc" } });
}

type RecetaConPiezas = Awaited<ReturnType<typeof cargarRecetasActivas>>[number];

function aPublica(r: RecetaConPiezas): RecetaPublica {
  const piezas = r.piezas
    .map((p) => ({
      id: p.id,
      etiqueta: p.etiqueta,
      tipo: p.tipo as string,
      categoriaTalla: categoriaTalla(p.tipo) as string,
      obligatoria: p.obligatoria,
    }))
    .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || a.etiqueta.localeCompare(b.etiqueta, "es"));

  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    precioDia: Number(r.precioDia),
    piezas,
    pideTallaRopa: piezas.some((p) => p.categoriaTalla === "ROPA"),
    pideTallaCalzado: piezas.some((p) => p.categoriaTalla === "CALZADO"),
  };
}

export async function listarRecetasPublicas(): Promise<RecetaPublica[]> {
  return (await cargarRecetasActivas()).map(aPublica);
}

// ---------- Búsqueda ----------

export interface SugerenciaCatalogo {
  familia: string;
  tipoDisfraz: string;
  imagenUrl: string | null;
  precioDia: number;
  disponibles: number;
}

// Disfraces del catálogo que coinciden con lo escrito y se pueden alquilar ahora. Si el cliente
// pide algo que ya existe, conviene mostrárselo antes de gastar piezas del almacén.
async function buscarEnCatalogo(tokens: string[]): Promise<SugerenciaCatalogo[]> {
  const buenos = tokens.filter((t) => t.length >= 4);
  if (buenos.length === 0) return [];

  const disfraces = await prisma.disfrazFisico.findMany({
    where: { origen: "CATALOGO" },
    select: { id: true, nombre: true, familia: true, tipoDisfraz: true, imagenUrl: true, precioAlquiler: true },
  });

  const coinciden = disfraces.filter((d) => {
    const pajar = normalizar(`${d.familia ?? d.nombre} ${d.tipoDisfraz}`);
    return buenos.some((t) => pajar.includes(t));
  });
  if (coinciden.length === 0) return [];

  const estados = new Map((await estadosDeDisfraces(coinciden.map((d) => d.id))).map((e) => [e.id, e.estado] as const));

  const familias = new Map<string, SugerenciaCatalogo>();
  for (const d of coinciden) {
    const clave = d.familia ?? d.nombre;
    const actual =
      familias.get(clave) ??
      {
        familia: clave,
        tipoDisfraz: d.tipoDisfraz,
        imagenUrl: d.imagenUrl,
        precioDia: Number(d.precioAlquiler),
        disponibles: 0,
      };
    if (estados.get(d.id) === "DISPONIBLE") actual.disponibles++;
    familias.set(clave, actual);
  }

  return Array.from(familias.values())
    .filter((f) => f.disponibles > 0)
    .sort((a, b) => b.disponibles - a.disponibles || a.familia.localeCompare(b.familia, "es"))
    .slice(0, 4);
}

// Guarda lo que pidió el cliente. Si ya pidió lo mismo hace menos de 10 minutos, no se duplica.
async function registrarPeticion(usuarioId: string, texto: string, textoNormalizado: string, recetaId: string | null) {
  const reciente = await prisma.peticionDisfraz.findFirst({
    where: { usuarioId, textoNormalizado, creadoEn: { gt: new Date(Date.now() - 10 * 60_000) } },
    select: { id: true },
  });
  if (reciente) return reciente.id;

  const creada = await prisma.peticionDisfraz.create({
    data: { usuarioId, texto, textoNormalizado, recetaId },
    select: { id: true },
  });
  return creada.id;
}

export type ResultadoBusqueda = "EXACTA" | "PARECIDA" | "SIN_RECETA";

export async function buscarRecetas(usuarioId: string, texto: string) {
  const limpio = texto.trim().slice(0, 80);
  const normalizado = normalizar(limpio);
  const tokens = palabrasSignificativas(normalizado);
  if (tokens.length === 0) {
    throw new ErrorBusqueda("Escribe qué disfraz quieres, por ejemplo: «bombero».");
  }

  const recetas = await cargarRecetasActivas();

  const puntuadas = recetas
    .map((r) => ({ receta: r, puntaje: puntuar(normalizado, tokens, r.palabrasClave) }))
    .filter((x) => x.puntaje >= 60)
    .sort((a, b) => b.puntaje - a.puntaje || a.receta.nombre.localeCompare(b.receta.nombre, "es"));

  const exactas = puntuadas.filter((x) => x.puntaje >= 100);

  let resultado: ResultadoBusqueda;
  let elegidas: RecetaConPiezas[];
  if (exactas.length > 0) {
    resultado = "EXACTA";
    elegidas = exactas.slice(0, 3).map((x) => x.receta);
  } else if (puntuadas.length > 0) {
    resultado = "PARECIDA";
    elegidas = puntuadas.slice(0, 3).map((x) => x.receta);
  } else {
    resultado = "SIN_RECETA";
    elegidas = recetas.slice(0, 6); // sin coincidencia: se ofrece lo que sí se puede armar
  }

  const peticionId = await registrarPeticion(
    usuarioId,
    limpio,
    tokens.join(" "),
    resultado === "SIN_RECETA" ? null : elegidas[0].id
  );

  let mensaje: string;
  if (resultado === "EXACTA") {
    mensaje =
      elegidas.length === 1
        ? `Podemos armar un disfraz de «${elegidas[0].nombre}».`
        : `Encontramos varias opciones para «${limpio}»:`;
  } else if (resultado === "PARECIDA") {
    mensaje = `No encontramos «${limpio}», pero quizá quisiste decir:`;
  } else {
    mensaje =
      elegidas.length > 0
        ? `Todavía no podemos armar un disfraz de «${limpio}». Ya registramos tu pedido para que la tienda lo considere. Mientras tanto, estos disfraces a medida sí están disponibles:`
        : `Todavía no podemos armar un disfraz de «${limpio}». Ya registramos tu pedido para que la tienda lo considere.`;
  }

  return {
    peticionId,
    resultado,
    mensaje,
    recetas: elegidas.map(aPublica),
    catalogo: await buscarEnCatalogo(tokens),
  };
}