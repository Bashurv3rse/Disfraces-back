import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function tallasPara(tipo: string): string[] {
  return tipo === "ZAPATO_ZAPATILLA" || tipo === "TACON" ? ["34", "36", "38", "40", "42"] : ["S", "M", "L", "XL"];
}

const COLORES_POR_TIPO: Record<string, string[]> = {
  SOMBRERO: ["negro", "rojo", "dorado", "multicolor"],
  CAMISA_POLO: ["blanco", "negro", "rojo", "verde"],
  PANTALON: ["azul", "negro", "gris"],
  ZAPATO_ZAPATILLA: ["negro", "marrón", "blanco"],
  ABRIGO: ["negro", "rojo", "blanco", "dorado"],
  CHALECO: ["negro", "rojo", "multicolor"],
  TRAJE: ["negro", "azul", "multicolor"],
  TACON: ["negro", "rojo", "dorado", "plateado"],
  ACCESORIO: ["multicolor", "dorado", "plateado", "blanco"],
};

interface PiezaSeed {
  nombre: string;
  tipo: string;
  color: string;
  temporadaOriginal: string;
  stock: number;
  precioAlquiler: number;
}

const piezasBase: PiezaSeed[] = [
  { nombre: "Sombrero de copa negro", tipo: "SOMBRERO", color: "negro", temporadaOriginal: "halloween", stock: 10, precioAlquiler: 12.0 },
  { nombre: "Gorro de Santa", tipo: "SOMBRERO", color: "rojo", temporadaOriginal: "navidad", stock: 15, precioAlquiler: 8.0 },
  { nombre: "Antifaz de plumas", tipo: "SOMBRERO", color: "multicolor", temporadaOriginal: "carnaval", stock: 6, precioAlquiler: 10.0 },
  { nombre: "Camisa de vampiro", tipo: "CAMISA_POLO", color: "negro", temporadaOriginal: "halloween", stock: 10, precioAlquiler: 18.0 },
  { nombre: "Sueter navideño", tipo: "CAMISA_POLO", color: "verde", temporadaOriginal: "navidad", stock: 12, precioAlquiler: 20.0 },
  { nombre: "Guayabera blanca", tipo: "CAMISA_POLO", color: "blanco", temporadaOriginal: "verano", stock: 9, precioAlquiler: 15.0 },
  { nombre: "Pantalón de cuero", tipo: "PANTALON", color: "negro", temporadaOriginal: "halloween", stock: 7, precioAlquiler: 22.0 },
  { nombre: "Pantalón a cuadros", tipo: "PANTALON", color: "rojo", temporadaOriginal: "navidad", stock: 8, precioAlquiler: 18.0 },
  { nombre: "Short de baño", tipo: "PANTALON", color: "azul", temporadaOriginal: "verano", stock: 10, precioAlquiler: 10.0 },
  { nombre: "Botas de combate", tipo: "ZAPATO_ZAPATILLA", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 25.0 },
  { nombre: "Zapatos de gala", tipo: "ZAPATO_ZAPATILLA", color: "negro", temporadaOriginal: "gala", stock: 5, precioAlquiler: 30.0 },
  { nombre: "Sandalias de playa", tipo: "ZAPATO_ZAPATILLA", color: "marrón", temporadaOriginal: "verano", stock: 12, precioAlquiler: 8.0 },
  { nombre: "Capa de vampiro", tipo: "ABRIGO", color: "negro", temporadaOriginal: "halloween", stock: 8, precioAlquiler: 20.0 },
  { nombre: "Abrigo de invierno", tipo: "ABRIGO", color: "blanco", temporadaOriginal: "navidad", stock: 6, precioAlquiler: 25.0 },
  { nombre: "Chaleco de gala", tipo: "CHALECO", color: "negro", temporadaOriginal: "gala", stock: 7, precioAlquiler: 18.0 },
  { nombre: "Chaleco de plumas", tipo: "CHALECO", color: "multicolor", temporadaOriginal: "carnaval", stock: 5, precioAlquiler: 15.0 },
  { nombre: "Traje de esmoquin", tipo: "TRAJE", color: "negro", temporadaOriginal: "gala", stock: 5, precioAlquiler: 45.0 },
  { nombre: "Disfraz completo de esqueleto", tipo: "TRAJE", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 35.0 },
  { nombre: "Tacones dorados", tipo: "TACON", color: "dorado", temporadaOriginal: "gala", stock: 6, precioAlquiler: 20.0 },
  { nombre: "Antifaz veneciano", tipo: "ACCESORIO", color: "multicolor", temporadaOriginal: "carnaval", stock: 10, precioAlquiler: 6.0 },
  { nombre: "Corona de rey", tipo: "SOMBRERO", color: "dorado", temporadaOriginal: "navidad", stock: 8, precioAlquiler: 15.0 },
  { nombre: "Máscara de águila", tipo: "SOMBRERO", color: "plateado", temporadaOriginal: "carnaval", stock: 5, precioAlquiler: 9.0 },
  { nombre: "Camisa de corsario", tipo: "CAMISA_POLO", color: "blanco", temporadaOriginal: "halloween", stock: 8, precioAlquiler: 16.0 },
  { nombre: "Polo hawaiano", tipo: "CAMISA_POLO", color: "multicolor", temporadaOriginal: "verano", stock: 10, precioAlquiler: 12.0 },
  { nombre: "Camisa de seda de gala", tipo: "CAMISA_POLO", color: "negro", temporadaOriginal: "gala", stock: 6, precioAlquiler: 22.0 },
  { nombre: "Falda escocesa", tipo: "PANTALON", color: "rojo", temporadaOriginal: "carnaval", stock: 6, precioAlquiler: 14.0 },
  { nombre: "Pantalón de vestir", tipo: "PANTALON", color: "negro", temporadaOriginal: "gala", stock: 7, precioAlquiler: 20.0 },
  { nombre: "Bermuda tropical", tipo: "PANTALON", color: "azul", temporadaOriginal: "verano", stock: 9, precioAlquiler: 9.0 },
  { nombre: "Botas vikingas", tipo: "ZAPATO_ZAPATILLA", color: "marrón", temporadaOriginal: "halloween", stock: 5, precioAlquiler: 24.0 },
  { nombre: "Mocasines elegantes", tipo: "ZAPATO_ZAPATILLA", color: "negro", temporadaOriginal: "gala", stock: 6, precioAlquiler: 20.0 },
  { nombre: "Chanclas tropicales", tipo: "ZAPATO_ZAPATILLA", color: "blanco", temporadaOriginal: "verano", stock: 14, precioAlquiler: 6.0 },
  { nombre: "Manto de rey", tipo: "ABRIGO", color: "rojo", temporadaOriginal: "navidad", stock: 5, precioAlquiler: 28.0 },
  { nombre: "Poncho carnavalero", tipo: "ABRIGO", color: "multicolor", temporadaOriginal: "carnaval", stock: 6, precioAlquiler: 14.0 },
  { nombre: "Chaleco escocés", tipo: "CHALECO", color: "rojo", temporadaOriginal: "carnaval", stock: 5, precioAlquiler: 13.0 },
  { nombre: "Chaleco de cuero", tipo: "CHALECO", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 16.0 },
  { nombre: "Traje de reno", tipo: "TRAJE", color: "marrón", temporadaOriginal: "navidad", stock: 6, precioAlquiler: 30.0 },
  { nombre: "Vestido de sirena", tipo: "TRAJE", color: "azul", temporadaOriginal: "verano", stock: 5, precioAlquiler: 38.0 },
  { nombre: "Tacones rojos pasión", tipo: "TACON", color: "rojo", temporadaOriginal: "gala", stock: 5, precioAlquiler: 18.0 },
  { nombre: "Collar de perlas", tipo: "ACCESORIO", color: "blanco", temporadaOriginal: "gala", stock: 8, precioAlquiler: 8.0 },
  { nombre: "Sombrilla decorativa", tipo: "ACCESORIO", color: "multicolor", temporadaOriginal: "carnaval", stock: 7, precioAlquiler: 5.0 },
  { nombre: "Sombrero de mago", tipo: "SOMBRERO", color: "negro", temporadaOriginal: "halloween", stock: 7, precioAlquiler: 13.0 },
  { nombre: "Diadema navideña", tipo: "SOMBRERO", color: "rojo", temporadaOriginal: "navidad", stock: 10, precioAlquiler: 6.0 },
  { nombre: "Sombrero de paja", tipo: "SOMBRERO", color: "blanco", temporadaOriginal: "verano", stock: 12, precioAlquiler: 7.0 },
  { nombre: "Camisa de leñador", tipo: "CAMISA_POLO", color: "rojo", temporadaOriginal: "halloween", stock: 9, precioAlquiler: 14.0 },
  { nombre: "Camisa formal blanca", tipo: "CAMISA_POLO", color: "blanco", temporadaOriginal: "gala", stock: 8, precioAlquiler: 17.0 },
  { nombre: "Blusa de bailarina", tipo: "CAMISA_POLO", color: "multicolor", temporadaOriginal: "carnaval", stock: 6, precioAlquiler: 15.0 },
  { nombre: "Jean clásico", tipo: "PANTALON", color: "azul", temporadaOriginal: "verano", stock: 11, precioAlquiler: 12.0 },
  { nombre: "Pantalón de mago", tipo: "PANTALON", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 16.0 },
  { nombre: "Falda de baile", tipo: "PANTALON", color: "multicolor", temporadaOriginal: "carnaval", stock: 5, precioAlquiler: 15.0 },
  { nombre: "Botines de mago", tipo: "ZAPATO_ZAPATILLA", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 22.0 },
  { nombre: "Zapatillas urbanas", tipo: "ZAPATO_ZAPATILLA", color: "blanco", temporadaOriginal: "verano", stock: 13, precioAlquiler: 10.0 },
  { nombre: "Botas de nieve", tipo: "ZAPATO_ZAPATILLA", color: "blanco", temporadaOriginal: "navidad", stock: 7, precioAlquiler: 20.0 },
  { nombre: "Capa de mago", tipo: "ABRIGO", color: "negro", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 22.0 },
  { nombre: "Abrigo de gala largo", tipo: "ABRIGO", color: "negro", temporadaOriginal: "gala", stock: 5, precioAlquiler: 32.0 },
  { nombre: "Chaleco de leñador", tipo: "CHALECO", color: "rojo", temporadaOriginal: "halloween", stock: 6, precioAlquiler: 15.0 },
  { nombre: "Chaleco navideño", tipo: "CHALECO", color: "rojo", temporadaOriginal: "navidad", stock: 8, precioAlquiler: 14.0 },
  { nombre: "Traje de mago", tipo: "TRAJE", color: "negro", temporadaOriginal: "halloween", stock: 5, precioAlquiler: 40.0 },
  { nombre: "Traje de baño de gala", tipo: "TRAJE", color: "azul", temporadaOriginal: "verano", stock: 6, precioAlquiler: 25.0 },
  { nombre: "Tacones plateados", tipo: "TACON", color: "plateado", temporadaOriginal: "carnaval", stock: 6, precioAlquiler: 19.0 },
  { nombre: "Varita mágica", tipo: "ACCESORIO", color: "dorado", temporadaOriginal: "halloween", stock: 12, precioAlquiler: 4.0 },
  { nombre: "Guantes de gala", tipo: "ACCESORIO", color: "blanco", temporadaOriginal: "gala", stock: 9, precioAlquiler: 5.0 },
];

async function main() {
    console.log("Limpiando datos de prueba anteriores…");
    await prisma.conjuntoPieza.deleteMany();
    await prisma.conjunto.deleteMany();
    await prisma.devolucionPieza.deleteMany();
    await prisma.devolucion.deleteMany();
    await prisma.alquilerPieza.deleteMany();
    await prisma.alquiler.deleteMany();
    await prisma.piezaProveedor.deleteMany();
    await prisma.ordenReabastecimiento.deleteMany();
    await prisma.reglaCompatibilidad.deleteMany();
    await prisma.pieza.deleteMany();

  console.log("Creando piezas…");
  const creadas = await Promise.all(
    piezasBase.map((p) =>
      prisma.pieza.create({
        data: {
          nombre: p.nombre,
          tipo: p.tipo as any,
          tallaEEUU: tallasPara(p.tipo)[0],
          color: p.color,
          temporadaOriginal: p.temporadaOriginal,
          stock: p.stock,
          precioAlquiler: p.precioAlquiler,
          tallasDisponibles: tallasPara(p.tipo),
          coloresDisponibles: COLORES_POR_TIPO[p.tipo] || ["negro", "blanco", "multicolor"],
        },
      })
    )
  );

  const porNombre = (nombre: string) => creadas.find((p) => p.nombre === nombre)!.id;

  console.log("Creando conjuntos predeterminados…");
  const conjuntos = [
    { nombre: "Bruja clásica", tipo: "PREDETERMINADO", temporadaEvento: "halloween", piezas: ["Sombrero de copa negro", "Camisa de vampiro", "Pantalón de cuero", "Botas de combate", "Capa de vampiro"] },
    { nombre: "Papá Noel", tipo: "PREDETERMINADO", temporadaEvento: "navidad", piezas: ["Gorro de Santa", "Sueter navideño", "Pantalón a cuadros", "Abrigo de invierno"] },
    { nombre: "Playero relajado", tipo: "PREDETERMINADO", temporadaEvento: "verano", piezas: ["Guayabera blanca", "Short de baño", "Sandalias de playa"] },
    { nombre: "Gala elegante", tipo: "PREDETERMINADO", temporadaEvento: "gala", piezas: ["Traje de esmoquin", "Chaleco de gala", "Zapatos de gala"] },
    { nombre: "Carnaval de Río", tipo: "PREDETERMINADO", temporadaEvento: "carnaval", piezas: ["Antifaz de plumas", "Chaleco de plumas", "Antifaz veneciano"] },
    { nombre: "Esqueleto completo", tipo: "PREDETERMINADO", temporadaEvento: "halloween", piezas: ["Disfraz completo de esqueleto", "Botas de combate"] },
    { nombre: "Rey del invierno", tipo: "PREDETERMINADO", temporadaEvento: "navidad", piezas: ["Corona de rey", "Manto de rey", "Pantalón de vestir", "Mocasines elegantes"] },
    { nombre: "Corsario fantasma", tipo: "PREDETERMINADO", temporadaEvento: "halloween", piezas: ["Camisa de corsario", "Botas vikingas", "Chaleco de cuero"] },
    { nombre: "Tropical vibes", tipo: "PREDETERMINADO", temporadaEvento: "verano", piezas: ["Polo hawaiano", "Bermuda tropical", "Chanclas tropicales"] },
    { nombre: "Noche de gala roja", tipo: "PREDETERMINADO", temporadaEvento: "gala", piezas: ["Camisa de seda de gala", "Pantalón de vestir", "Tacones rojos pasión", "Collar de perlas"] },
    { nombre: "Máscara veneciana real", tipo: "PREDETERMINADO", temporadaEvento: "carnaval", piezas: ["Máscara de águila", "Poncho carnavalero", "Sombrilla decorativa"] },
    { nombre: "Sirena del mar", tipo: "PREDETERMINADO", temporadaEvento: "verano", piezas: ["Vestido de sirena", "Chanclas tropicales"] },
    { nombre: "Reno navideño", tipo: "PREDETERMINADO", temporadaEvento: "navidad", piezas: ["Traje de reno", "Manto de rey"] },
    { nombre: "Mago supremo", tipo: "PREDETERMINADO", temporadaEvento: "halloween", piezas: ["Sombrero de mago", "Traje de mago", "Capa de mago", "Botines de mago", "Varita mágica"] },
    { nombre: "Elegancia de gala", tipo: "PREDETERMINADO", temporadaEvento: "gala", piezas: ["Abrigo de gala largo", "Camisa formal blanca", "Guantes de gala"] },
    { nombre: "Leñador del bosque", tipo: "PREDETERMINADO", temporadaEvento: "halloween", piezas: ["Camisa de leñador", "Chaleco de leñador"] },
    { nombre: "Playa y sol", tipo: "PREDETERMINADO", temporadaEvento: "verano", piezas: ["Sombrero de paja", "Jean clásico", "Zapatillas urbanas"] },
    { nombre: "Nieve navideña", tipo: "PREDETERMINADO", temporadaEvento: "navidad", piezas: ["Diadema navideña", "Chaleco navideño", "Botas de nieve"] },
    { nombre: "Baile de carnaval", tipo: "PREDETERMINADO", temporadaEvento: "carnaval", piezas: ["Blusa de bailarina", "Falda de baile", "Tacones plateados"] },
    { nombre: "Combo fiesta temática (ejemplo)", tipo: "PERSONALIZADO", temporadaEvento: "fiesta temática mixta", piezas: ["Sombrero de copa negro", "Chaleco de gala", "Tacones dorados"] },
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