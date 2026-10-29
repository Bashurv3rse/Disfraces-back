import { PrismaClient, TipoPrenda } from "@prisma/client";
import type { Prisma } from "@prisma/client";

interface PiezaSuelta {
  nombre: string;
  tipo: TipoPrenda;
  color: string;
}

interface PiezaReceta {
  etiqueta: string;
  tipo: TipoPrenda;
  colores?: string[];
  nombreContiene?: string;
  obligatoria?: boolean;
}

interface DefinicionReceta {
  nombre: string;
  descripcion: string;
  palabrasClave: string[]; // sin tildes y en minúsculas
  precioDia: number;
  piezas: PiezaReceta[];
}

const TALLAS_ROPA = ["S", "M", "L", "XL"];
const TALLAS_CALZADO = ["37", "38", "39", "40", "41", "42"];
const UNIDADES_POR_TALLA = 2;

// Piezas genéricas, no atadas a ningún disfraz del catálogo.
const PIEZAS_ROPA: PiezaSuelta[] = [
  { nombre: "Casco rojo", tipo: "SOMBRERO", color: "rojo" },
  { nombre: "Casco amarillo", tipo: "SOMBRERO", color: "amarillo" },
  { nombre: "Casco blanco", tipo: "SOMBRERO", color: "blanco" },
  { nombre: "Gorra de policía", tipo: "SOMBRERO", color: "azul" },
  { nombre: "Gorro de chef", tipo: "SOMBRERO", color: "blanco" },
  { nombre: "Gorro de marinero", tipo: "SOMBRERO", color: "blanco" },
  { nombre: "Camisa amarilla", tipo: "CAMISA", color: "amarillo" },
  { nombre: "Camisa roja", tipo: "CAMISA", color: "rojo" },
  { nombre: "Camisa blanca", tipo: "CAMISA", color: "blanco" },
  { nombre: "Camisa celeste", tipo: "CAMISA", color: "celeste" },
  { nombre: "Camisa azul", tipo: "CAMISA", color: "azul" },
  { nombre: "Pantalón negro", tipo: "PANTALON", color: "negro" },
  { nombre: "Pantalón azul", tipo: "PANTALON", color: "azul" },
  { nombre: "Pantalón blanco", tipo: "PANTALON", color: "blanco" },
  { nombre: "Bata blanca", tipo: "ABRIGO", color: "blanco" },
  { nombre: "Traje espacial blanco", tipo: "ABRIGO", color: "blanco" },
];

const PIEZAS_CALZADO: PiezaSuelta[] = [
  { nombre: "Botas negras", tipo: "ZAPATO", color: "negro" },
  { nombre: "Zapatos blancos", tipo: "ZAPATO", color: "blanco" },
  { nombre: "Zapatos negros", tipo: "ZAPATO", color: "negro" },
];

// Talla única (pañuelos y accesorios): no se ajustan por talla.
const PIEZAS_UNICAS: PiezaSuelta[] = [
  { nombre: "Pañuelo rojo", tipo: "PANUELO", color: "rojo" },
  { nombre: "Pañuelo azul", tipo: "PANUELO", color: "azul" },
  { nombre: "Manguera de bombero", tipo: "ACCESORIO", color: "rojo" },
  { nombre: "Silbato", tipo: "ACCESORIO", color: "plateado" },
  { nombre: "Estetoscopio", tipo: "ACCESORIO", color: "plateado" },
];

const RECETAS: DefinicionReceta[] = [
  {
    nombre: "Bombero",
    descripcion: "Casco, camisa de color vivo, pantalón oscuro y botas.",
    palabrasClave: ["bombero", "bomberos", "bombera", "apagafuegos"],
    precioDia: 35,
    piezas: [
      { etiqueta: "Casco", tipo: "SOMBRERO", colores: ["rojo", "amarillo"], nombreContiene: "casco" },
      { etiqueta: "Camisa", tipo: "CAMISA", colores: ["amarillo", "rojo"] },
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["negro", "azul"] },
      { etiqueta: "Botas", tipo: "ZAPATO", colores: ["negro"], nombreContiene: "botas" },
      { etiqueta: "Manguera", tipo: "ACCESORIO", nombreContiene: "manguera", obligatoria: false },
    ],
  },
  {
    nombre: "Policía",
    descripcion: "Gorra, camisa celeste o azul, pantalón oscuro y zapatos negros.",
    palabrasClave: ["policia", "policias", "oficial de policia", "patrullero"],
    precioDia: 32,
    piezas: [
      { etiqueta: "Gorra", tipo: "SOMBRERO", nombreContiene: "gorra" },
      { etiqueta: "Camisa", tipo: "CAMISA", colores: ["celeste", "azul"] },
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["azul", "negro"] },
      { etiqueta: "Zapatos", tipo: "ZAPATO", colores: ["negro"] },
      { etiqueta: "Silbato", tipo: "ACCESORIO", nombreContiene: "silbato", obligatoria: false },
    ],
  },
  {
    nombre: "Doctor",
    descripcion: "Bata blanca, camisa y pantalón claros, zapatos blancos y estetoscopio.",
    palabrasClave: ["doctor", "doctora", "medico", "medica", "cirujano"],
    precioDia: 30,
    piezas: [
      { etiqueta: "Bata", tipo: "ABRIGO", nombreContiene: "bata" },
      { etiqueta: "Camisa", tipo: "CAMISA", colores: ["celeste", "blanco"] },
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["blanco", "azul"] },
      { etiqueta: "Zapatos", tipo: "ZAPATO", colores: ["blanco"] },
      { etiqueta: "Estetoscopio", tipo: "ACCESORIO", nombreContiene: "estetoscopio" },
    ],
  },
  {
    nombre: "Chef",
    descripcion: "Gorro de chef, camisa blanca, pantalón oscuro y zapatos negros.",
    palabrasClave: ["chef", "cocinero", "cocinera"],
    precioDia: 28,
    piezas: [
      { etiqueta: "Gorro de chef", tipo: "SOMBRERO", nombreContiene: "chef" },
      { etiqueta: "Camisa", tipo: "CAMISA", colores: ["blanco"] },
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["negro", "blanco"] },
      { etiqueta: "Zapatos", tipo: "ZAPATO", colores: ["negro"] },
    ],
  },
  {
    nombre: "Marinero",
    descripcion: "Gorro de marinero, camisa y pantalón claros, zapatos blancos y pañuelo.",
    palabrasClave: ["marinero", "marino", "marinera de barco"],
    precioDia: 30,
    piezas: [
      { etiqueta: "Gorro", tipo: "SOMBRERO", nombreContiene: "marinero" },
      { etiqueta: "Camisa", tipo: "CAMISA", colores: ["blanco", "azul"] },
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["blanco", "azul"] },
      { etiqueta: "Zapatos", tipo: "ZAPATO", colores: ["blanco"] },
      { etiqueta: "Pañuelo", tipo: "PANUELO", colores: ["rojo", "azul"] },
    ],
  },
  {
    nombre: "Astronauta",
    descripcion: "Casco blanco, traje espacial, pantalón blanco y zapatos blancos.",
    palabrasClave: ["astronauta", "cosmonauta", "espacial"],
    precioDia: 40,
    piezas: [
      { etiqueta: "Casco", tipo: "SOMBRERO", colores: ["blanco"], nombreContiene: "casco" },
      { etiqueta: "Traje espacial", tipo: "ABRIGO", nombreContiene: "espacial" },
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["blanco"] },
      { etiqueta: "Zapatos", tipo: "ZAPATO", colores: ["blanco"] },
    ],
  },
];

function filasDelAlmacen(almacenId: string): Prisma.PrendaCreateManyInput[] {
  const filas: Prisma.PrendaCreateManyInput[] = [];

  const agregar = (p: PiezaSuelta, talla: string) => {
    for (let i = 0; i < UNIDADES_POR_TALLA; i++) {
      filas.push({
        nombre: p.nombre,
        tipo: p.tipo,
        color: p.color,
        talla,
        disfrazHogarId: almacenId,
        disfrazActualId: almacenId,
      });
    }
  };

  for (const p of PIEZAS_ROPA) for (const t of TALLAS_ROPA) agregar(p, t);
  for (const p of PIEZAS_CALZADO) for (const t of TALLAS_CALZADO) agregar(p, t);
  for (const p of PIEZAS_UNICAS) agregar(p, "única");

  return filas;
}

// Crea el almacén de piezas sueltas y las recetas de ejemplo.
// No es destructivo: si el almacén ya existe no toca sus piezas, y las recetas que ya
// existen (por nombre) se dejan como están.
export async function sembrarAlmacenYRecetas(prisma: PrismaClient) {
  const almacenExistente = await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" } });

  if (almacenExistente) {
    console.log("El almacén ya existe: no se tocan sus piezas.");
  } else {
    const almacen = await prisma.disfrazFisico.create({
      data: {
        nombre: "Almacén de piezas sueltas",
        tipoDisfraz: "Almacén",
        temporadaEvento: "almacen",
        precioAlquiler: 0,
        origen: "ALMACEN",
      },
    });
    const filas = filasDelAlmacen(almacen.id);
    await prisma.prenda.createMany({ data: filas });
    console.log(`Almacén creado con ${filas.length} piezas sueltas.`);
  }

  let creadas = 0;
  for (const r of RECETAS) {
    const existe = await prisma.receta.findUnique({ where: { nombre: r.nombre } });
    if (existe) continue;

    await prisma.receta.create({
      data: {
        nombre: r.nombre,
        descripcion: r.descripcion,
        palabrasClave: r.palabrasClave,
        precioDia: r.precioDia,
        piezas: {
          create: r.piezas.map((p) => ({
            etiqueta: p.etiqueta,
            tipo: p.tipo,
            colores: p.colores ?? [],
            nombreContiene: p.nombreContiene ?? null,
            obligatoria: p.obligatoria ?? true,
          })),
        },
      },
    });
    creadas++;
  }
  console.log(`Recetas creadas: ${creadas} (de ${RECETAS.length}).`);
}