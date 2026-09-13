import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface PrendaSeed {
  nombre: string;
  tipo: string;
  color: string;
  talla: string;
}

interface DisfrazSeed {
  nombre: string;
  tipoDisfraz: string;
  temporadaEvento: string;
  precioAlquiler: number;
  prendas: PrendaSeed[];
}

const disfraces: DisfrazSeed[] = [
  {
    nombre: "Marinera #1",
    tipoDisfraz: "Marinera",
    temporadaEvento: "criollo",
    precioAlquiler: 45.0,
    prendas: [
      { nombre: "Pañuelo de marinera", tipo: "PANUELO", color: "blanco", talla: "única" },
      { nombre: "Falda de marinera", tipo: "FALDA", color: "rojo", talla: "M" },
      { nombre: "Blusa de marinera", tipo: "CAMISA", color: "blanco", talla: "M" },
      { nombre: "Zapatillas de baile", tipo: "ZAPATO", color: "blanco", talla: "37" },
    ],
  },
  {
    nombre: "Marinera #2",
    tipoDisfraz: "Marinera",
    temporadaEvento: "criollo",
    precioAlquiler: 45.0,
    prendas: [
      { nombre: "Pañuelo de marinera", tipo: "PANUELO", color: "blanco", talla: "única" },
      { nombre: "Falda de marinera", tipo: "FALDA", color: "azul", talla: "S" },
      { nombre: "Blusa de marinera", tipo: "CAMISA", color: "blanco", talla: "S" },
      { nombre: "Zapatillas de baile", tipo: "ZAPATO", color: "blanco", talla: "36" },
    ],
  },
  {
    nombre: "Spiderman #1",
    tipoDisfraz: "Superhéroe",
    temporadaEvento: "halloween",
    precioAlquiler: 38.0,
    prendas: [
      { nombre: "Traje de Spiderman", tipo: "CAMISA", color: "rojo", talla: "M" },
      { nombre: "Pantalón de Spiderman", tipo: "PANTALON", color: "azul", talla: "M" },
      { nombre: "Botas de superhéroe", tipo: "ZAPATO", color: "rojo", talla: "38" },
      { nombre: "Máscara de Spiderman", tipo: "ACCESORIO", color: "rojo", talla: "única" },
    ],
  },
  {
    nombre: "Batman #1",
    tipoDisfraz: "Superhéroe",
    temporadaEvento: "halloween",
    precioAlquiler: 42.0,
    prendas: [
      { nombre: "Traje de Batman", tipo: "CAMISA", color: "negro", talla: "L" },
      { nombre: "Pantalón de Batman", tipo: "PANTALON", color: "negro", talla: "L" },
      { nombre: "Botas de superhéroe", tipo: "ZAPATO", color: "negro", talla: "40" },
      { nombre: "Capa de Batman", tipo: "ABRIGO", color: "negro", talla: "L" },
      { nombre: "Máscara de Batman", tipo: "ACCESORIO", color: "negro", talla: "única" },
    ],
  },
  {
    nombre: "Chucky #1",
    tipoDisfraz: "Terror",
    temporadaEvento: "halloween",
    precioAlquiler: 35.0,
    prendas: [
      { nombre: "Overol de Chucky", tipo: "CAMISA", color: "multicolor", talla: "S" },
      { nombre: "Pantalón de Chucky", tipo: "PANTALON", color: "azul", talla: "S" },
      { nombre: "Zapatos de muñeco", tipo: "ZAPATO", color: "negro", talla: "36" },
      { nombre: "Máscara de Chucky", tipo: "ACCESORIO", color: "multicolor", talla: "única" },
    ],
  },
  {
    nombre: "Novia clásica #1",
    tipoDisfraz: "Novia",
    temporadaEvento: "boda",
    precioAlquiler: 60.0,
    prendas: [
      { nombre: "Vestido de novia", tipo: "ABRIGO", color: "blanco", talla: "M" },
      { nombre: "Velo de novia", tipo: "ACCESORIO", color: "blanco", talla: "única" },
      { nombre: "Tacones de novia", tipo: "TACON", color: "blanco", talla: "37" },
    ],
  },
  {
    nombre: "Traje de baño tropical #1",
    tipoDisfraz: "Playa",
    temporadaEvento: "verano",
    precioAlquiler: 20.0,
    prendas: [
      { nombre: "Camisa hawaiana", tipo: "CAMISA", color: "multicolor", talla: "M" },
      { nombre: "Short de baño", tipo: "PANTALON", color: "azul", talla: "M" },
      { nombre: "Sandalias de playa", tipo: "ZAPATO", color: "marrón", talla: "39" },
    ],
  },
  {
    nombre: "Futbolista #1",
    tipoDisfraz: "Fútbol",
    temporadaEvento: "deportivo",
    precioAlquiler: 25.0,
    prendas: [
      { nombre: "Camiseta de fútbol", tipo: "CAMISA", color: "rojo", talla: "M" },
      { nombre: "Short deportivo", tipo: "PANTALON", color: "blanco", talla: "M" },
      { nombre: "Chimpunes", tipo: "ZAPATO", color: "negro", talla: "40" },
    ],
  },
  {
    nombre: "Bruja clásica #1",
    tipoDisfraz: "Bruja",
    temporadaEvento: "halloween",
    precioAlquiler: 30.0,
    prendas: [
      { nombre: "Sombrero de bruja", tipo: "SOMBRERO", color: "negro", talla: "única" },
      { nombre: "Capa de bruja", tipo: "ABRIGO", color: "negro", talla: "M" },
      { nombre: "Botas de bruja", tipo: "ZAPATO", color: "negro", talla: "37" },
      { nombre: "Escoba decorativa", tipo: "ACCESORIO", color: "marrón", talla: "única" },
    ],
  },
  {
    nombre: "Papá Noel #1",
    tipoDisfraz: "Navidad",
    temporadaEvento: "navidad",
    precioAlquiler: 32.0,
    prendas: [
      { nombre: "Gorro de Santa", tipo: "SOMBRERO", color: "rojo", talla: "única" },
      { nombre: "Abrigo de Santa", tipo: "ABRIGO", color: "rojo", talla: "L" },
      { nombre: "Pantalón de Santa", tipo: "PANTALON", color: "rojo", talla: "L" },
      { nombre: "Botas de Santa", tipo: "ZAPATO", color: "negro", talla: "41" },
    ],
  },
  {
    nombre: "Torero #1",
    tipoDisfraz: "Torero",
    temporadaEvento: "carnaval",
    precioAlquiler: 34.0,
    prendas: [
      { nombre: "Sombrero de torero", tipo: "SOMBRERO", color: "negro", talla: "única" },
      { nombre: "Chaleco de torero", tipo: "CHALECO", color: "rojo", talla: "M" },
      { nombre: "Pantalón de torero", tipo: "PANTALON", color: "negro", talla: "M" },
      { nombre: "Zapatos de torero", tipo: "ZAPATO", color: "negro", talla: "38" },
    ],
  },
  {
    nombre: "Reina de gala #1",
    tipoDisfraz: "Realeza",
    temporadaEvento: "gala",
    precioAlquiler: 55.0,
    prendas: [
      { nombre: "Corona de reina", tipo: "SOMBRERO", color: "dorado", talla: "única" },
      { nombre: "Manto de reina", tipo: "ABRIGO", color: "rojo", talla: "M" },
      { nombre: "Tacones de gala", tipo: "TACON", color: "dorado", talla: "37" },
      { nombre: "Collar de reina", tipo: "ACCESORIO", color: "dorado", talla: "única" },
    ],
  },
  {
    nombre: "Pirata del Caribe #1",
    tipoDisfraz: "Pirata",
    temporadaEvento: "halloween",
    precioAlquiler: 36.0,
    prendas: [
      { nombre: "Sombrero de pirata", tipo: "SOMBRERO", color: "negro", talla: "única" },
      { nombre: "Camisa de pirata", tipo: "CAMISA", color: "blanco", talla: "M" },
      { nombre: "Pantalón de pirata", tipo: "PANTALON", color: "marrón", talla: "M" },
      { nombre: "Botas de pirata", tipo: "ZAPATO", color: "marrón", talla: "39" },
      { nombre: "Parche de pirata", tipo: "ACCESORIO", color: "negro", talla: "única" },
    ],
  },
  {
    nombre: "Vaquero del oeste #1",
    tipoDisfraz: "Vaquero",
    temporadaEvento: "carnaval",
    precioAlquiler: 33.0,
    prendas: [
      { nombre: "Sombrero de vaquero", tipo: "SOMBRERO", color: "marrón", talla: "única" },
      { nombre: "Chaleco de vaquero", tipo: "CHALECO", color: "marrón", talla: "M" },
      { nombre: "Pantalón de vaquero", tipo: "PANTALON", color: "azul", talla: "M" },
      { nombre: "Botas de vaquero", tipo: "ZAPATO", color: "marrón", talla: "40" },
    ],
  },
  {
    nombre: "Gala elegante #1",
    tipoDisfraz: "Gala",
    temporadaEvento: "gala",
    precioAlquiler: 50.0,
    prendas: [
      { nombre: "Camisa de gala", tipo: "CAMISA", color: "blanco", talla: "M" },
      { nombre: "Pantalón de vestir", tipo: "PANTALON", color: "negro", talla: "M" },
      { nombre: "Chaleco de gala", tipo: "CHALECO", color: "negro", talla: "M" },
      { nombre: "Zapatos de gala", tipo: "ZAPATO", color: "negro", talla: "39" },
      { nombre: "Corbata de gala", tipo: "ACCESORIO", color: "negro", talla: "única" },
    ],
  },
];

async function main() {
  console.log("Limpiando datos de prueba anteriores…");
  await prisma.sustitucion.deleteMany();
  await prisma.devolucionPrenda.deleteMany();
  await prisma.devolucion.deleteMany();
  await prisma.alquilerDisfraz.deleteMany();
  await prisma.alquiler.deleteMany();
  await prisma.prendaProveedor.deleteMany();
  await prisma.ordenReabastecimiento.deleteMany();
  await prisma.prenda.deleteMany();
  await prisma.disfrazFisico.deleteMany();

  console.log("Creando disfraces físicos y sus prendas…");
  let totalPrendas = 0;
  for (const d of disfraces) {
    const disfraz = await prisma.disfrazFisico.create({
      data: {
        nombre: d.nombre,
        tipoDisfraz: d.tipoDisfraz,
        temporadaEvento: d.temporadaEvento,
        precioAlquiler: d.precioAlquiler,
      },
    });

    await prisma.prenda.createMany({
      data: d.prendas.map((p) => ({
        nombre: p.nombre,
        tipo: p.tipo as any,
        color: p.color,
        talla: p.talla,
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      })),
    });
    totalPrendas += d.prendas.length;
  }

  console.log(`Listo: ${disfraces.length} disfraces físicos y ${totalPrendas} prendas creadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());