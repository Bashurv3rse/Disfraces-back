import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface PrendaBase {
  nombre: string;
  tipo: string;
  color: string;
}

interface FamiliaDisfraz {
  nombre: string;
  tipoDisfraz: string;
  temporadaEvento: string;
  precioAlquiler: number;
  imagenUrl: string;
  prendas: PrendaBase[];
}

const TALLAS_ROPA = ["S", "M", "L"];
const TALLAS_CALZADO = [37, 39, 41];

function tallaPara(tipo: string, indice: number): string {
  if (tipo === "ZAPATO" || tipo === "TACON") return String(TALLAS_CALZADO[indice]);
  if (tipo === "PANUELO" || tipo === "ACCESORIO") return "única";
  return TALLAS_ROPA[indice];
}

const familias: FamiliaDisfraz[] = [
  {
    nombre: "Marinera Peruana",
    tipoDisfraz: "Marinera",
    temporadaEvento: "criollo",
    precioAlquiler: 45.0,
    imagenUrl: "/disfraces-img/marinera-peruana.jpg",
    prendas: [
      { nombre: "Pañuelo de marinera", tipo: "PANUELO", color: "blanco" },
      { nombre: "Falda de marinera", tipo: "FALDA", color: "rojo" },
      { nombre: "Blusa de marinera", tipo: "CAMISA", color: "blanco" },
      { nombre: "Zapatillas de baile", tipo: "ZAPATO", color: "blanco" },
    ],
  },
  {
    nombre: "Chalán Costeño",
    tipoDisfraz: "Chalán",
    temporadaEvento: "criollo",
    precioAlquiler: 40.0,
    imagenUrl: "/disfraces-img/chalan-costeno.jpg",
    prendas: [
      { nombre: "Pañuelo de chalán", tipo: "PANUELO", color: "rojo" },
      { nombre: "Camisa de chalán", tipo: "CAMISA", color: "blanco" },
      { nombre: "Pantalón de chalán", tipo: "PANTALON", color: "negro" },
      { nombre: "Zapatos de vestir", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Spider-Man",
    tipoDisfraz: "Superhéroe",
    temporadaEvento: "halloween",
    precioAlquiler: 38.0,
    imagenUrl: "/disfraces-img/spider-man.jpg",
    prendas: [
      { nombre: "Traje de Spiderman", tipo: "CAMISA", color: "rojo" },
      { nombre: "Pantalón de Spiderman", tipo: "PANTALON", color: "azul" },
      { nombre: "Botas de superhéroe", tipo: "ZAPATO", color: "rojo" },
      { nombre: "Máscara de Spiderman", tipo: "ACCESORIO", color: "rojo" },
    ],
  },
  {
    nombre: "Batman",
    tipoDisfraz: "Superhéroe",
    temporadaEvento: "halloween",
    precioAlquiler: 42.0,
    imagenUrl: "/disfraces-img/batman.jpg",
    prendas: [
      { nombre: "Traje de Batman", tipo: "CAMISA", color: "negro" },
      { nombre: "Pantalón de Batman", tipo: "PANTALON", color: "negro" },
      { nombre: "Botas de superhéroe", tipo: "ZAPATO", color: "negro" },
      { nombre: "Capa de Batman", tipo: "ABRIGO", color: "negro" },
    ],
  },
  {
    nombre: "Superman",
    tipoDisfraz: "Superhéroe",
    temporadaEvento: "halloween",
    precioAlquiler: 40.0,
    imagenUrl: "/disfraces-img/superman.jpg",
    prendas: [
      { nombre: "Traje de Superman", tipo: "CAMISA", color: "azul" },
      { nombre: "Capa de Superman", tipo: "ABRIGO", color: "rojo" },
      { nombre: "Botas de superhéroe", tipo: "ZAPATO", color: "rojo" },
    ],
  },
  {
    nombre: "Chucky",
    tipoDisfraz: "Terror",
    temporadaEvento: "halloween",
    precioAlquiler: 35.0,
    imagenUrl: "/disfraces-img/chucky.jpg",
    prendas: [
      { nombre: "Overol de Chucky", tipo: "CAMISA", color: "multicolor" },
      { nombre: "Pantalón de Chucky", tipo: "PANTALON", color: "azul" },
      { nombre: "Zapatos de muñeco", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Bruja Clásica",
    tipoDisfraz: "Bruja",
    temporadaEvento: "halloween",
    precioAlquiler: 30.0,
    imagenUrl: "/disfraces-img/bruja-clasica.jpg",
    prendas: [
      { nombre: "Sombrero de bruja", tipo: "SOMBRERO", color: "negro" },
      { nombre: "Capa de bruja", tipo: "ABRIGO", color: "negro" },
      { nombre: "Botas de bruja", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Mago Misterioso",
    tipoDisfraz: "Mago",
    temporadaEvento: "halloween",
    precioAlquiler: 34.0,
    imagenUrl: "/disfraces-img/mago-misterioso.jpg",
    prendas: [
      { nombre: "Sombrero de mago", tipo: "SOMBRERO", color: "negro" },
      { nombre: "Capa de mago", tipo: "ABRIGO", color: "morado" },
      { nombre: "Traje de mago", tipo: "CAMISA", color: "negro" },
      { nombre: "Botas de mago", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Conde Vampiro",
    tipoDisfraz: "Vampiro",
    temporadaEvento: "halloween",
    precioAlquiler: 36.0,
    imagenUrl: "/disfraces-img/conde-vampiro.jpg",
    prendas: [
      { nombre: "Capa de vampiro", tipo: "ABRIGO", color: "negro" },
      { nombre: "Camisa de vampiro", tipo: "CAMISA", color: "blanco" },
      { nombre: "Pantalón de vampiro", tipo: "PANTALON", color: "negro" },
      { nombre: "Zapatos de vampiro", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Novio de Boda",
    tipoDisfraz: "Novio de Boda",
    temporadaEvento: "boda",
    precioAlquiler: 55.0,
    imagenUrl: "/disfraces-img/novio-de-boda.jpg",
    prendas: [
      { nombre: "Saco de novio", tipo: "ABRIGO", color: "negro" },
      { nombre: "Camisa formal blanca", tipo: "CAMISA", color: "blanco" },
      { nombre: "Pantalón de vestir", tipo: "PANTALON", color: "negro" },
      { nombre: "Zapatos de taco negro", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Gala Elegante",
    tipoDisfraz: "Gala",
    temporadaEvento: "gala",
    precioAlquiler: 50.0,
    imagenUrl: "/disfraces-img/gala-elegante.jpg",
    prendas: [
      { nombre: "Camisa de gala", tipo: "CAMISA", color: "blanco" },
      { nombre: "Pantalón de vestir", tipo: "PANTALON", color: "negro" },
      { nombre: "Chaleco de gala", tipo: "CHALECO", color: "negro" },
      { nombre: "Zapatos de gala", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Padrino de Boda",
    tipoDisfraz: "Padrino",
    temporadaEvento: "boda",
    precioAlquiler: 48.0,
    imagenUrl: "/disfraces-img/padrino-de-boda.jpg",
    prendas: [
      { nombre: "Chaleco de padrino", tipo: "CHALECO", color: "gris" },
      { nombre: "Camisa formal", tipo: "CAMISA", color: "blanco" },
      { nombre: "Pantalón de vestir", tipo: "PANTALON", color: "negro" },
      { nombre: "Zapatos de vestir", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Traje de baño tropical",
    tipoDisfraz: "Playa",
    temporadaEvento: "verano",
    precioAlquiler: 20.0,
    imagenUrl: "/disfraces-img/traje-de-bano-tropical.jpg",
    prendas: [
      { nombre: "Camisa hawaiana", tipo: "CAMISA", color: "multicolor" },
      { nombre: "Short de baño", tipo: "PANTALON", color: "azul" },
      { nombre: "Sandalias de playa", tipo: "ZAPATO", color: "marrón" },
    ],
  },
  {
    nombre: "Futbolista",
    tipoDisfraz: "Fútbol",
    temporadaEvento: "deportivo",
    precioAlquiler: 25.0,
    imagenUrl: "/disfraces-img/futbolista.jpg",
    prendas: [
      { nombre: "Camiseta de fútbol", tipo: "CAMISA", color: "rojo" },
      { nombre: "Short deportivo", tipo: "PANTALON", color: "blanco" },
      { nombre: "Chimpunes", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Surfista Playero",
    tipoDisfraz: "Playa",
    temporadaEvento: "verano",
    precioAlquiler: 22.0,
    imagenUrl: "/disfraces-img/surfista-playero.jpg",
    prendas: [
      { nombre: "Polo deportivo", tipo: "CAMISA", color: "azul" },
      { nombre: "Bermuda de playa", tipo: "PANTALON", color: "multicolor" },
      { nombre: "Sandalias deportivas", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Papá Noel",
    tipoDisfraz: "Navidad",
    temporadaEvento: "navidad",
    precioAlquiler: 32.0,
    imagenUrl: "/disfraces-img/papa-noel.jpg",
    prendas: [
      { nombre: "Gorro de Santa", tipo: "SOMBRERO", color: "rojo" },
      { nombre: "Abrigo de Santa", tipo: "ABRIGO", color: "rojo" },
      { nombre: "Pantalón de Santa", tipo: "PANTALON", color: "rojo" },
      { nombre: "Botas de Santa", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Torero",
    tipoDisfraz: "Torero",
    temporadaEvento: "carnaval",
    precioAlquiler: 34.0,
    imagenUrl: "/disfraces-img/torero.jpg",
    prendas: [
      { nombre: "Sombrero de torero", tipo: "SOMBRERO", color: "negro" },
      { nombre: "Chaleco de torero", tipo: "CHALECO", color: "rojo" },
      { nombre: "Pantalón de torero", tipo: "PANTALON", color: "negro" },
      { nombre: "Zapatos de torero", tipo: "ZAPATO", color: "negro" },
    ],
  },
  {
    nombre: "Pirata del Caribe",
    tipoDisfraz: "Pirata",
    temporadaEvento: "halloween",
    precioAlquiler: 36.0,
    imagenUrl: "/disfraces-img/pirata-del-caribe.jpg",
    prendas: [
      { nombre: "Sombrero de pirata", tipo: "SOMBRERO", color: "negro" },
      { nombre: "Camisa de pirata", tipo: "CAMISA", color: "blanco" },
      { nombre: "Pantalón de pirata", tipo: "PANTALON", color: "marrón" },
      { nombre: "Botas de pirata", tipo: "ZAPATO", color: "marrón" },
    ],
  },
  {
    nombre: "Vaquero del Oeste",
    tipoDisfraz: "Vaquero",
    temporadaEvento: "carnaval",
    precioAlquiler: 33.0,
    imagenUrl: "/disfraces-img/vaquero-del-oeste.jpg",
    prendas: [
      { nombre: "Sombrero de vaquero", tipo: "SOMBRERO", color: "marrón" },
      { nombre: "Chaleco de vaquero", tipo: "CHALECO", color: "marrón" },
      { nombre: "Pantalón de vaquero", tipo: "PANTALON", color: "azul" },
      { nombre: "Botas de vaquero", tipo: "ZAPATO", color: "marrón" },
    ],
  },
  {
    nombre: "Reina de Gala",
    tipoDisfraz: "Realeza",
    temporadaEvento: "gala",
    precioAlquiler: 55.0,
    imagenUrl: "/disfraces-img/reina-de-gala.jpg",
    prendas: [
      { nombre: "Corona de reina", tipo: "SOMBRERO", color: "dorado" },
      { nombre: "Manto de reina", tipo: "ABRIGO", color: "rojo" },
      { nombre: "Tacones de gala", tipo: "TACON", color: "dorado" },
    ],
  },
  {
    nombre: "Rey de Gala",
    tipoDisfraz: "Realeza",
    temporadaEvento: "gala",
    precioAlquiler: 55.0,
    imagenUrl: "/disfraces-img/rey-de-gala.jpg",
    prendas: [
      { nombre: "Corona de rey", tipo: "SOMBRERO", color: "dorado" },
      { nombre: "Manto de rey", tipo: "ABRIGO", color: "azul" },
      { nombre: "Zapatos de gala", tipo: "ZAPATO", color: "negro" },
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

  console.log("Creando 3 instancias por cada familia…");
  let totalDisfraces = 0;
  let totalPrendas = 0;
  const idsCreados: { nombre: string; id: string }[] = [];

  for (const familia of familias) {
    for (let i = 0; i < 3; i++) {
      const nombreInstancia = `${familia.nombre} #${i + 1}`;
      const disfraz = await prisma.disfrazFisico.create({
        data: {
          nombre: nombreInstancia,
          tipoDisfraz: familia.tipoDisfraz,
          temporadaEvento: familia.temporadaEvento,
          precioAlquiler: familia.precioAlquiler,
          imagenUrl: familia.imagenUrl,
        },
      });
      idsCreados.push({ nombre: nombreInstancia, id: disfraz.id });

      await prisma.prenda.createMany({
        data: familia.prendas.map((p) => ({
          nombre: p.nombre,
          tipo: p.tipo as any,
          color: p.color,
          talla: tallaPara(p.tipo, i),
          disfrazHogarId: disfraz.id,
          disfrazActualId: disfraz.id,
        })),
      });

      totalDisfraces++;
      totalPrendas += familia.prendas.length;
    }
  }

  console.log("Marcando algunos ejemplos de estados (incompleto / en reparación)…");

  const marinera1 = idsCreados.find((d) => d.nombre === "Marinera Peruana #1")!;
  const panueloMarinera1 = await prisma.prenda.findFirst({
    where: { disfrazHogarId: marinera1.id, tipo: "PANUELO" },
  });
  if (panueloMarinera1) {
    await prisma.prenda.update({ where: { id: panueloMarinera1.id }, data: { estado: "FALTANTE" } });
  }

  const superman1 = idsCreados.find((d) => d.nombre === "Superman #1")!;
  await prisma.disfrazFisico.update({ where: { id: superman1.id }, data: { estadoManual: "EN_REPARACION" } });

  console.log(`Listo: ${totalDisfraces} disfraces físicos y ${totalPrendas} prendas creadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());