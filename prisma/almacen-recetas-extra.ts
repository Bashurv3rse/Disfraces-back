import { PrismaClient } from "@prisma/client";
import type { Prisma, TipoPrenda } from "@prisma/client";

interface PiezaSuelta {
  nombre: string;
  tipo: TipoPrenda;
  color: string;
  unidades?: number; // por talla; 2 si no se indica
}

interface Hueco {
  etiqueta: string;
  tipo: TipoPrenda;
  colores: string[]; // el PRIMER color es el preferido; si no hay stock en esa talla se usa el siguiente
  nombreContiene?: string;
  obligatoria: boolean;
}

interface DefinicionReceta {
  nombre: string;
  descripcion: string;
  palabrasClave: string[]; // sin tildes y en minúsculas
  precioDia: number;
  piezas: Hueco[];
}

const TALLAS_ROPA = ["S", "M", "L", "XL"];
const TALLAS_CALZADO = ["37", "38", "39", "40", "41", "42"];
const UNIDADES_POR_TALLA = 2;

function tallasDe(tipo: TipoPrenda): string[] {
  if (tipo === "ZAPATO" || tipo === "TACON") return TALLAS_CALZADO;
  if (tipo === "PANUELO" || tipo === "ACCESORIO") return ["única"];
  return TALLAS_ROPA;
}

// Una pieza con varios colores = un grupo por color.
const v = (tipo: TipoPrenda, nombre: string, colores: string[], unidades?: number): PiezaSuelta[] =>
  colores.map((color) => ({ nombre, tipo, color, unidades }));

const h = (
  etiqueta: string,
  tipo: TipoPrenda,
  colores: string[] = [],
  nombreContiene?: string,
  obligatoria = true
): Hueco => ({ etiqueta, tipo, colores, nombreContiene, obligatoria });

// Piezas NUEVAS. Las genéricas que ya existen en el almacén (camisas, pantalones, zapatos negros y blancos,
// botas negras, pañuelos, bata blanca) se reutilizan y no se repiten aquí.
const PIEZAS: PiezaSuelta[] = [
  // ----- Sombreros y tocados -----
  ...v("SOMBRERO", "Sombrero andino", ["blanco", "marrón"]),
  ...v("SOMBRERO", "Chullo andino", ["rojo", "multicolor", "marrón"]),
  ...v("SOMBRERO", "Sombrero de paja", ["blanco", "marrón"], 3),
  ...v("SOMBRERO", "Llauto inca", ["rojo", "dorado"]),
  ...v("SOMBRERO", "Sombrero de caporal", ["negro", "dorado"]),
  ...v("SOMBRERO", "Cintillo shipibo", ["multicolor"]),
  ...v("SOMBRERO", "Sombrero de danzante", ["negro"]),
  ...v("SOMBRERO", "Sombrero de detective", ["marrón"]),
  ...v("SOMBRERO", "Gorra de mecánico", ["azul", "rojo"]),
  ...v("SOMBRERO", "Gorra de piloto", ["negro", "azul"]),
  ...v("SOMBRERO", "Peluca de payaso", ["multicolor", "rojo"]),
  ...v("SOMBRERO", "Capucha ninja", ["negro"]),
  // ----- Camisas y blusas -----
  ...v("CAMISA", "Camisa negra", ["negro"]),
  ...v("CAMISA", "Camisa de cuadros", ["rojo", "azul"]),
  ...v("CAMISA", "Camisa de payaso", ["multicolor"]),
  ...v("CAMISA", "Blusa andina", ["blanco", "rojo"]),
  ...v("CAMISA", "Blusa shipiba", ["negro", "blanco"]),
  ...v("CAMISA", "Unku inca", ["rojo", "azul"]),
  // ----- Pantalones y faldas -----
  ...v("PANTALON", "Pantalón marrón", ["marrón"]),
  ...v("PANTALON", "Overol de jean", ["azul"]),
  ...v("PANTALON", "Pantalón de payaso", ["multicolor"]),
  ...v("FALDA", "Pollera andina", ["fucsia", "rojo", "verde", "azul"]),
  ...v("FALDA", "Falda shipiba", ["negro", "multicolor"]),
  // ----- Abrigos, capas y mantos -----
  ...v("ABRIGO", "Lliclla andina", ["multicolor", "rojo"]),
  ...v("ABRIGO", "Poncho andino", ["rojo", "marrón", "multicolor"]),
  ...v("ABRIGO", "Manto inca", ["rojo", "dorado"]),
  ...v("ABRIGO", "Capa de diablada", ["rojo", "negro"]),
  ...v("ABRIGO", "Chaqueta de caporal", ["dorado", "rojo", "negro"]),
  ...v("ABRIGO", "Chaqueta de danzante", ["multicolor", "dorado"]),
  ...v("ABRIGO", "Gabardina", ["marrón", "crema"]),
  ...v("ABRIGO", "Overol de mecánico", ["azul"]),
  ...v("ABRIGO", "Sábana de fantasma", ["blanco"]),
  // ----- Calzado -----
  ...v("ZAPATO", "Ojotas de cuero", ["marrón", "negro"], 3),
  ...v("ZAPATO", "Zapatos marrones", ["marrón"]),
  ...v("ZAPATO", "Botas de caucho", ["verde", "negro"]),
  ...v("ZAPATO", "Zapatos de payaso", ["rojo"]),
  // ----- Pañuelos y fajas -----
  ...v("PANUELO", "Faja ninja", ["rojo", "negro"]),
  // ----- Accesorios (talla única) -----
  ...v("ACCESORIO", "Zampoña de utilería", ["marrón"]),
  ...v("ACCESORIO", "Quipu de utilería", ["crema"]),
  ...v("ACCESORIO", "Chuspa andina", ["multicolor"]),
  ...v("ACCESORIO", "Pectoral inca", ["dorado"]),
  ...v("ACCESORIO", "Máscara de diablada", ["rojo"]),
  ...v("ACCESORIO", "Tridente de utilería", ["rojo"]),
  ...v("ACCESORIO", "Cascabeles de caporal", ["plateado"]),
  ...v("ACCESORIO", "Cajón peruano de utilería", ["marrón"]),
  ...v("ACCESORIO", "Collar de chaquiras", ["multicolor"]),
  ...v("ACCESORIO", "Red de pesca", ["crema"]),
  ...v("ACCESORIO", "Tijeras de danzante", ["plateado"]),
  ...v("ACCESORIO", "Lupa de utilería", ["plateado"]),
  ...v("ACCESORIO", "Guantes de trabajo", ["marrón"]),
  ...v("ACCESORIO", "Lentes de laboratorio", ["transparente"]),
  ...v("ACCESORIO", "Gafas de aviador", ["plateado"]),
  ...v("ACCESORIO", "Nariz de payaso", ["rojo"]),
  ...v("ACCESORIO", "Cadenas de utilería", ["plateado"]),
];

const RECETAS: DefinicionReceta[] = [
  // ======================= Trajes típicos del Perú =======================
  {
    nombre: "Mujer andina",
    descripcion: "Traje de la sierra: sombrero, blusa, pollera de color, lliclla (manta) y ojotas.",
    palabrasClave: ["andina", "pollera", "cholita", "serrana"],
    precioDia: 38,
    piezas: [
      h("Sombrero", "SOMBRERO", ["blanco", "marron"], "sombrero andino"),
      h("Blusa", "CAMISA", ["blanco", "rojo"], "blusa andina"),
      h("Pollera", "FALDA", ["fucsia", "rojo", "verde", "azul"], "pollera"),
      h("Lliclla", "ABRIGO", ["multicolor", "rojo"], "lliclla"),
      h("Ojotas", "ZAPATO", ["negro", "marron"], "ojotas"),
      h("Pañuelo", "PANUELO", ["rojo", "azul"], undefined, false),
    ],
  },
  {
    nombre: "Pastor andino",
    descripcion: "Chullo, camisa, poncho, pantalón y ojotas; con zampoña opcional.",
    palabrasClave: ["chullo", "poncho", "pastor", "alpaquero", "andino", "altiplano"],
    precioDia: 36,
    piezas: [
      h("Chullo", "SOMBRERO", ["rojo", "multicolor", "marron"], "chullo"),
      h("Camisa", "CAMISA", ["blanco", "celeste"]),
      h("Poncho", "ABRIGO", ["rojo", "marron", "multicolor"], "poncho"),
      h("Pantalón", "PANTALON", ["negro", "azul"]),
      h("Ojotas", "ZAPATO", ["marron", "negro"], "ojotas"),
      h("Zampoña", "ACCESORIO", [], "zampona", false),
    ],
  },
  {
    nombre: "Inca",
    descripcion: "Llauto, unku (túnica), manto y ojotas; con pectoral dorado opcional.",
    palabrasClave: ["inca", "incas", "incaico", "sapa inca", "inti raymi", "tahuantinsuyo"],
    precioDia: 42,
    piezas: [
      h("Llauto", "SOMBRERO", ["rojo", "dorado"], "llauto"),
      h("Unku", "CAMISA", ["rojo", "azul"], "unku"),
      h("Manto", "ABRIGO", ["rojo", "dorado"], "manto inca"),
      h("Ojotas", "ZAPATO", ["marron", "negro"], "ojotas"),
      h("Pectoral", "ACCESORIO", ["dorado"], "pectoral", false),
    ],
  },
  {
    nombre: "Chasqui",
    descripcion: "Mensajero del Tahuantinsuyo: llauto, unku, ojotas, quipu y chuspa.",
    palabrasClave: ["chasqui", "chasquis", "mensajero", "mensajero inca", "corredor inca"],
    precioDia: 34,
    piezas: [
      h("Llauto", "SOMBRERO", ["dorado", "rojo"], "llauto"),
      h("Unku", "CAMISA", ["azul", "rojo"], "unku"),
      h("Ojotas", "ZAPATO", ["marron", "negro"], "ojotas"),
      h("Quipu", "ACCESORIO", [], "quipu"),
      h("Chuspa", "ACCESORIO", [], "chuspa", false),
    ],
  },
  {
    nombre: "Diablada puneña",
    descripcion: "Máscara de diablo, capa, camisa, pantalón y botas; con tridente opcional.",
    palabrasClave: ["diablada", "diablo", "diablos", "diabla"],
    precioDia: 45,
    piezas: [
      h("Máscara", "ACCESORIO", ["rojo"], "diablada"),
      h("Capa", "ABRIGO", ["rojo", "negro"], "diablada"),
      h("Camisa", "CAMISA", ["negro", "rojo"]),
      h("Pantalón", "PANTALON", ["negro"]),
      h("Botas", "ZAPATO", ["negro"], "botas"),
      h("Tridente", "ACCESORIO", ["rojo"], "tridente", false),
    ],
  },
  {
    nombre: "Caporal",
    descripcion: "Sombrero, chaqueta brillante, camisa, pantalón y botas; con cascabeles opcionales.",
    palabrasClave: ["caporal", "caporales"],
    precioDia: 44,
    piezas: [
      h("Sombrero", "SOMBRERO", ["negro", "dorado"], "caporal"),
      h("Chaqueta", "ABRIGO", ["dorado", "rojo", "negro"], "caporal"),
      h("Camisa", "CAMISA", ["blanco"]),
      h("Pantalón", "PANTALON", ["negro", "blanco"]),
      h("Botas", "ZAPATO", ["negro"], "botas"),
      h("Cascabeles", "ACCESORIO", ["plateado"], "cascabeles", false),
    ],
  },
  {
    nombre: "Norteño",
    descripcion: "Costa norte (tondero): sombrero de paja, camisa, pantalón, pañuelo y zapatos; con cajón opcional.",
    palabrasClave: ["norteno", "nortena", "tondero", "costa norte"],
    precioDia: 34,
    piezas: [
      h("Sombrero", "SOMBRERO", ["blanco", "marron"], "paja"),
      h("Camisa", "CAMISA", ["blanco"]),
      h("Pantalón", "PANTALON", ["blanco", "negro"]),
      h("Pañuelo", "PANUELO", ["rojo", "azul"]),
      h("Zapatos", "ZAPATO", ["blanco", "negro", "marron"], "zapato"),
      h("Cajón", "ACCESORIO", [], "cajon", false),
    ],
  },
  {
    nombre: "Traje shipibo",
    descripcion: "Selva (Ucayali): cintillo, blusa y falda con diseños kené, y collar de chaquiras.",
    palabrasClave: ["shipibo", "shipiba", "amazonico", "amazonica", "selvatico", "selvatica", "selva"],
    precioDia: 38,
    piezas: [
      h("Cintillo", "SOMBRERO", ["multicolor"], "shipibo"),
      h("Blusa", "CAMISA", ["negro", "blanco"], "shipiba"),
      h("Falda", "FALDA", ["negro", "multicolor"], "shipiba"),
      h("Collar", "ACCESORIO", [], "chaquiras"),
    ],
  },
  {
    nombre: "Pescador",
    descripcion: "Pescador de la costa: sombrero de paja, camisa, pantalón y ojotas; con red opcional.",
    palabrasClave: ["pescador", "pescadora", "pesca"],
    precioDia: 30,
    piezas: [
      h("Sombrero", "SOMBRERO", ["blanco", "marron"], "paja"),
      h("Camisa", "CAMISA", ["celeste", "blanco", "azul"]),
      h("Pantalón", "PANTALON", ["azul", "blanco"]),
      h("Ojotas", "ZAPATO", ["marron", "negro"], "ojotas"),
      h("Red", "ACCESORIO", [], "red de pesca", false),
    ],
  },
  {
    nombre: "Danza de las tijeras",
    descripcion: "Danzante de tijeras (Ayacucho, Huancavelica, Apurímac): sombrero, chaqueta bordada, camisa, pantalón, zapatos y tijeras.",
    palabrasClave: ["danza de las tijeras", "danza de tijeras", "tijeras", "danzaq", "danzante de tijeras"],
    precioDia: 48,
    piezas: [
      h("Sombrero", "SOMBRERO", ["negro"], "danzante"),
      h("Chaqueta", "ABRIGO", ["multicolor", "dorado"], "danzante"),
      h("Camisa", "CAMISA", ["blanco"]),
      h("Pantalón", "PANTALON", ["negro"]),
      h("Zapatos", "ZAPATO", ["negro"], "zapato"),
      h("Tijeras", "ACCESORIO", ["plateado"], "tijeras"),
    ],
  },
  // ======================= Variedad general =======================
  {
    nombre: "Detective",
    descripcion: "Sombrero, gabardina, camisa, pantalón y zapatos; con lupa opcional.",
    palabrasClave: ["detective", "investigador", "investigadora", "espia", "sherlock"],
    precioDia: 30,
    piezas: [
      h("Sombrero", "SOMBRERO", ["marron"], "detective"),
      h("Gabardina", "ABRIGO", ["marron", "crema"], "gabardina"),
      h("Camisa", "CAMISA", ["blanco"]),
      h("Pantalón", "PANTALON", ["negro", "marron"]),
      h("Zapatos", "ZAPATO", ["negro", "marron"], "zapato"),
      h("Lupa", "ACCESORIO", [], "lupa", false),
    ],
  },
  {
    nombre: "Granjero",
    descripcion: "Sombrero de paja, camisa de cuadros, overol y botas de caucho.",
    palabrasClave: ["granjero", "granjera", "granja", "agricultor", "agricultora", "campesino"],
    precioDia: 28,
    piezas: [
      h("Sombrero", "SOMBRERO", ["marron", "blanco"], "paja"),
      h("Camisa", "CAMISA", ["rojo", "azul"], "cuadros"),
      h("Overol", "PANTALON", ["azul"], "overol"),
      h("Botas", "ZAPATO", ["verde", "negro"], "botas de caucho"),
      h("Pañuelo", "PANUELO", ["rojo", "azul"], undefined, false),
    ],
  },
  {
    nombre: "Mecánico",
    descripcion: "Gorra, overol y botas; con guantes opcionales.",
    palabrasClave: ["mecanico", "mecanica", "taller"],
    precioDia: 28,
    piezas: [
      h("Gorra", "SOMBRERO", ["azul", "rojo"], "mecanico"),
      h("Overol", "ABRIGO", ["azul"], "overol de mecanico"),
      h("Botas", "ZAPATO", ["negro"], "botas"),
      h("Guantes", "ACCESORIO", [], "guantes", false),
    ],
  },
  {
    nombre: "Científico",
    descripcion: "Bata blanca, camisa, pantalón, zapatos y lentes de laboratorio.",
    palabrasClave: ["cientifico", "cientifica", "quimico", "quimica", "laboratorio"],
    precioDia: 30,
    piezas: [
      h("Bata", "ABRIGO", ["blanco"], "bata"),
      h("Camisa", "CAMISA", ["celeste", "blanco"]),
      h("Pantalón", "PANTALON", ["negro", "azul"]),
      h("Zapatos", "ZAPATO", ["negro", "blanco"], "zapato"),
      h("Lentes", "ACCESORIO", [], "lentes de laboratorio"),
    ],
  },
  {
    nombre: "Piloto",
    descripcion: "Gorra, camisa, pantalón y zapatos; con gafas de aviador opcionales.",
    palabrasClave: ["piloto", "aviador", "aviadora"],
    precioDia: 32,
    piezas: [
      h("Gorra", "SOMBRERO", ["negro", "azul"], "piloto"),
      h("Camisa", "CAMISA", ["blanco"]),
      h("Pantalón", "PANTALON", ["negro"]),
      h("Zapatos", "ZAPATO", ["negro"], "zapato"),
      h("Gafas", "ACCESORIO", [], "aviador", false),
    ],
  },
  {
    nombre: "Payaso",
    descripcion: "Peluca, camisa y pantalón de colores, zapatos grandes y nariz roja.",
    palabrasClave: ["payaso", "payasa", "clown"],
    precioDia: 26,
    piezas: [
      h("Peluca", "SOMBRERO", ["multicolor", "rojo"], "peluca de payaso"),
      h("Camisa", "CAMISA", ["multicolor"], "payaso"),
      h("Pantalón", "PANTALON", ["multicolor"], "payaso"),
      h("Zapatos", "ZAPATO", ["rojo"], "payaso"),
      h("Nariz", "ACCESORIO", [], "nariz de payaso"),
    ],
  },
  {
    nombre: "Ninja",
    descripcion: "Capucha, camisa y pantalón negros, botas; con faja opcional.",
    palabrasClave: ["ninja", "ninjas"],
    precioDia: 30,
    piezas: [
      h("Capucha", "SOMBRERO", ["negro"], "capucha ninja"),
      h("Camisa", "CAMISA", ["negro"]),
      h("Pantalón", "PANTALON", ["negro"]),
      h("Botas", "ZAPATO", ["negro"], "botas"),
      h("Faja", "PANUELO", ["rojo", "negro"], "faja ninja", false),
    ],
  },
  {
    nombre: "Fantasma",
    descripcion: "Sábana de fantasma; con cadenas opcionales.",
    palabrasClave: ["fantasma", "fantasmita", "espectro"],
    precioDia: 20,
    piezas: [h("Sábana", "ABRIGO", ["blanco"], "fantasma"), h("Cadenas", "ACCESORIO", [], "cadenas", false)],
  },
];

// Agrega piezas al almacén y crea las recetas que falten. No borra ni modifica nada que ya exista.
export async function sembrarAlmacenYRecetasExtra(prisma: PrismaClient) {
  const almacen =
    (await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" } })) ??
    (await prisma.disfrazFisico.create({
      data: {
        nombre: "Almacén de piezas sueltas",
        tipoDisfraz: "Almacén",
        temporadaEvento: "almacen",
        precioAlquiler: 0,
        origen: "ALMACEN",
      },
    }));

  // Piezas: se cuenta lo que ya hay de cada pieza y talla, y solo se completa lo que falta.
  const existentes = await prisma.prenda.groupBy({
    by: ["tipo", "nombre", "color", "talla"],
    where: { disfrazHogarId: almacen.id },
    _count: { _all: true },
  });
  const cuenta = new Map(
    existentes.map((e) => [`${e.tipo}|${e.nombre.toLowerCase()}|${e.color.toLowerCase()}|${e.talla}`, e._count._all] as const)
  );

  const filas: Prisma.PrendaCreateManyInput[] = [];
  for (const p of PIEZAS) {
    const meta = p.unidades ?? UNIDADES_POR_TALLA;
    for (const talla of tallasDe(p.tipo)) {
      const hay = cuenta.get(`${p.tipo}|${p.nombre.toLowerCase()}|${p.color.toLowerCase()}|${talla}`) ?? 0;
      for (let i = hay; i < meta; i++) {
        filas.push({ nombre: p.nombre, tipo: p.tipo, color: p.color, talla, disfrazHogarId: almacen.id, disfrazActualId: almacen.id });
      }
    }
  }
  if (filas.length > 0) await prisma.prenda.createMany({ data: filas });
  console.log(`Almacén: ${filas.length} piezas nuevas (las que ya existían no se tocaron).`);

  // Recetas.
  const recetasActuales = await prisma.receta.findMany({ select: { nombre: true, palabrasClave: true } });
  const nombres = new Set(recetasActuales.map((r) => r.nombre.toLowerCase()));
  const duena = new Map<string, string>();
  for (const r of recetasActuales) for (const k of r.palabrasClave) duena.set(k, r.nombre);

  let pendientes = await prisma.peticionDisfraz.findMany({ where: { recetaId: null }, select: { id: true, textoNormalizado: true } });
  let creadas = 0;
  let vinculadas = 0;

  for (const r of RECETAS) {
    if (nombres.has(r.nombre.toLowerCase())) continue;

    const claves = r.palabrasClave.filter((k) => {
      const otra = duena.get(k);
      if (otra) console.warn(`  (aviso) «${k}» ya pertenece a la receta «${otra}»: se omite en «${r.nombre}».`);
      return !otra;
    });
    if (claves.length === 0) {
      console.warn(`  (aviso) «${r.nombre}» se omite: todas sus palabras clave ya están en uso.`);
      continue;
    }

    const creada = await prisma.receta.create({
      data: {
        nombre: r.nombre,
        descripcion: r.descripcion,
        palabrasClave: claves,
        precioDia: r.precioDia,
        piezas: {
          create: r.piezas.map((p) => ({
            etiqueta: p.etiqueta,
            tipo: p.tipo,
            colores: p.colores,
            nombreContiene: p.nombreContiene ?? null,
            obligatoria: p.obligatoria,
          })),
        },
      },
    });
    for (const k of claves) duena.set(k, r.nombre);
    creadas++;

    // Los pedidos antiguos que pedían justo esto quedan ligados a la receta y atendidos.
    const ids = pendientes.filter((p) => claves.some((k) => ` ${p.textoNormalizado} `.includes(` ${k} `))).map((p) => p.id);
    if (ids.length > 0) {
      await prisma.peticionDisfraz.updateMany({ where: { id: { in: ids } }, data: { recetaId: creada.id, atendida: true } });
      pendientes = pendientes.filter((p) => !ids.includes(p.id));
      vinculadas += ids.length;
    }
  }
  console.log(`Recetas nuevas: ${creadas} (de ${RECETAS.length}). Pedidos antiguos atendidos: ${vinculadas}.`);
}

// Se puede correr solo: npx ts-node --project prisma/tsconfig.json prisma/almacen-recetas-extra.ts
if (require.main === module) {
  const prisma = new PrismaClient();
  sembrarAlmacenYRecetasExtra(prisma)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}