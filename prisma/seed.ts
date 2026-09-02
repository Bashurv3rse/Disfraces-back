import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const piezas = [
  { nombre: "Sombrero de copa negro", tipo: "SOMBRERO", tallaEEUU: "M", color: "negro", temporadaOriginal: "halloween", stock: 10, precioAlquiler: 12.0 },
  { nombre: "Gorro de Santa", tipo: "SOMBRERO", tallaEEUU: "L", color: "rojo", temporadaOriginal: "navidad", stock: 15, precioAlquiler: 8.0 },
  { nombre: "Antifaz de plumas", tipo: "SOMBRERO", tallaEEUU: "M", color: "multicolor", temporadaOriginal: "carnaval", stock: 6, precioAlquiler: 10.0 },
  { nombre: "Camisa de vampiro", tipo: "CAMISA_POLO", tallaEEUU: "M", color: "negro", temporadaOriginal: "halloween", stock: 10, precioAlquiler: 18.0 },
  { nombre: "Sueter navideño", tipo: "CAMISA_POLO", tallaEEUU: "L", color: "verde", temporadaOriginal: "navidad", stock: 12, precioAlquiler: 20.0 },
  { nombre: "Guayabera blanca", tipo: "CAMISA_POLO", tallaEEUU: "M", color: "blanco", temporadaOriginal: "verano", stock: 9, precioAlquiler: 15.0 },
  { nombre: "Pantalón de cuero", tipo: "PANTALON", tallaEEUU: "M", color: "negro", temporadaOriginal: "halloween", stock: 7, precioAlquiler: 22.0 },
  { nombre: "Pantalón a cuadros", tipo: "PANTALON", tallaEEUU: "L", color: "rojo", temporadaOriginal: "navidad", stock: 8, precioAlquiler: 18.0 },
  { nombre: "Short de baño", tipo: "PANTALON", tallaEEUU: "M", color: "azul", temporadaOriginal: "verano", stock: 10, precioAlquiler: 10.0 },
  { nombre: "Botas de combate", tipo: "ZAPATO_ZAPATILLA", tallaEEUU: "9", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 25.0 },
  { nombre: "Zapatos de gala", tipo: "ZAPATO_ZAPATILLA", tallaEEUU: "10", color: "negro", temporadaOriginal: "gala", stock: 5, precioAlquiler: 30.0 },
  { nombre: "Sandalias de playa", tipo: "ZAPATO_ZAPATILLA", tallaEEUU: "8", color: "marrón", temporadaOriginal: "verano", stock: 12, precioAlquiler: 8.0 },
  { nombre: "Capa de vampiro", tipo: "ABRIGO", tallaEEUU: "M", color: "negro", temporadaOriginal: "halloween", stock: 8, precioAlquiler: 20.0 },
  { nombre: "Abrigo de invierno", tipo: "ABRIGO", tallaEEUU: "L", color: "blanco", temporadaOriginal: "navidad", stock: 6, precioAlquiler: 25.0 },
  { nombre: "Chaleco de gala", tipo: "CHALECO", tallaEEUU: "M", color: "negro", temporadaOriginal: "gala", stock: 7, precioAlquiler: 18.0 },
  { nombre: "Chaleco de plumas", tipo: "CHALECO", tallaEEUU: "M", color: "multicolor", temporadaOriginal: "carnaval", stock: 5, precioAlquiler: 15.0 },
  { nombre: "Traje de esmoquin", tipo: "TRAJE", tallaEEUU: "M", color: "negro", temporadaOriginal: "gala", stock: 5, precioAlquiler: 45.0 },
  { nombre: "Disfraz completo de esqueleto", tipo: "TRAJE", tallaEEUU: "M", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 35.0 },
  { nombre: "Tacones dorados", tipo: "TACON", tallaEEUU: "8", color: "dorado", temporadaOriginal: "gala", stock: 6, precioAlquiler: 20.0 },
  { nombre: "Antifaz veneciano", tipo: "ACCESORIO", tallaEEUU: "única", color: "multicolor", temporadaOriginal: "carnaval", stock: 10, precioAlquiler: 6.0 },
];

async function main() {
  console.log("Limpiando datos de prueba anteriores…");
  await prisma.conjuntoPieza.deleteMany();
  await prisma.conjunto.deleteMany();
  await prisma.pieza.deleteMany();

  console.log("Creando piezas…");
  const creadas = await Promise.all(
    piezas.map((p) => prisma.pieza.create({ data: p as any }))
  );

  const porNombre = (nombre: string) => creadas.find((p) => p.nombre === nombre)!.id;

  console.log("Creando conjuntos predeterminados…");
  const conjuntos = [
    {
      nombre: "Bruja clásica",
      tipo: "PREDETERMINADO",
      temporadaEvento: "halloween",
      piezas: ["Sombrero de copa negro", "Camisa de vampiro", "Pantalón de cuero", "Botas de combate", "Capa de vampiro"],
    },
    {
      nombre: "Papá Noel",
      tipo: "PREDETERMINADO",
      temporadaEvento: "navidad",
      piezas: ["Gorro de Santa", "Sueter navideño", "Pantalón a cuadros", "Abrigo de invierno"],
    },
    {
      nombre: "Playero relajado",
      tipo: "PREDETERMINADO",
      temporadaEvento: "verano",
      piezas: ["Guayabera blanca", "Short de baño", "Sandalias de playa"],
    },
    {
      nombre: "Gala elegante",
      tipo: "PREDETERMINADO",
      temporadaEvento: "gala",
      piezas: ["Traje de esmoquin", "Chaleco de gala", "Zapatos de gala"],
    },
    {
      nombre: "Carnaval de Río",
      tipo: "PREDETERMINADO",
      temporadaEvento: "carnaval",
      piezas: ["Antifaz de plumas", "Chaleco de plumas", "Antifaz veneciano"],
    },
    {
      nombre: "Esqueleto completo",
      tipo: "PREDETERMINADO",
      temporadaEvento: "halloween",
      piezas: ["Disfraz completo de esqueleto", "Botas de combate"],
    },
    // Ejemplo de conjunto PERSONALIZADO combinando piezas de dos temporadas distintas,
    // para demostrar la funcionalidad central del sistema (HU2, Sprint 3).
    {
      nombre: "Combo fiesta temática (ejemplo)",
      tipo: "PERSONALIZADO",
      temporadaEvento: "fiesta temática mixta",
      piezas: ["Sombrero de copa negro", "Chaleco de gala", "Tacones dorados"],
    },
  ];

  for (const c of conjuntos) {
    await prisma.conjunto.create({
      data: {
        nombre: c.nombre,
        tipo: c.tipo as any,
        temporadaEvento: c.temporadaEvento,
        piezas: { create: c.piezas.map((nombre) => ({ piezaId: porNombre(nombre) })) },
      },
    });
  }

  console.log(`Listo: ${creadas.length} piezas y ${conjuntos.length} conjuntos creados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());