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
    imagenUrl: "https://pixabay.com/get/g641310ea96117e6fdd783bfafd5fad16e5a61d70d984d05db0415e968b61d0b18f750edb2924066f40f7ac2c7c17d8967b1182f8f3c9aefcdbc3fb0eec226760_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g3cfdfe73fb89a29dfb774aef0b579357e6c350824a22aca8114f1829a7c26baf6314aa0574782fa083a9e05c80e2edfc7106cf59d2c7135cd7c7cac42a75832b_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g62ac4c451e57dd46b604be8f924b4cfe8140a39271d58bd797172d84f3492cfff93daa7aa1c07d66d6b82b9ace74c6281e8e3dccd685e31ff15d551893445f38_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/gcd8e714b4c883b49154c89d3bb10271512e7df25fd4b33c04d21b2b42d793c712418e934fc3109a2007dfb4dbffa82f31f4067b0fab02b56d2d0051c0a195b75_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g52bd1dca50c60877a3f8ecd890ac8ebcac55b561855ff965f3e6ca26c5a51990971409d9346a45a04da96b01ea39bc8e12b931fc53be8e2a01d67060bd51d559_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g1fe6735ddd91c3154358697b19753a887a6b1d0192ee61a4a9699abf42a4e17e1e8442f73fc6424ec6a9f128ff4a0f0a27027502fa24b26254b911a4a07823ab_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/ga32f5fd4fab45bbc5ef3c37f802c1aa6595fff78e2cc8b6d427010ff1a650c1d58bad7f746e948e7735d4734daec51c8fcd8447ec6717d958022cb5d500bca18_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g70dea93afdfbf4372047a317d1b086f72bc33c92dd0a02af42960d477b1156bce4efee5bb8ebbb772bed3ef2138b467e6ec05e19a661655ebb804ef9c6884815_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g3b68bcd3675e8bfb9faa167aedf5aa6a73af1d6b6293035177929fd4b7c82def8bad9064c737b7d6bb4245c7a79d3f3c69a942a5a2c407e9bc0c484e8684e60d_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g070145fce757a53a11ad0b80358fd908a9a05dad195e2cb8647c0a21d62ade3c274f719b6a1b5211ae682e3554a470fd_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/geb013e6265082c316075516f41db85dbc863f4d45f32d336e7f031e02b791a89a6d39433bffe9cea4872c2ea94a3db97d3cca094b58bb727ac4e3adae05ac845_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g3f9899b83c7503ab43c8b686b575af246f9e9a2164309a3f3c638e170eae177f57bd211e3864f267dc26364901647b6c0ee706ac66616a7f14f501d9dfa7611a_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g12fa9e6d931bcbc976364603cd5966bfd78b06bf18df6c15792ab7dccf58d73d76a0456a501ca7f2c178f7e927d6654c8f997b37219a6a2146829862473bf6c9_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g59afff507489d75d85e41a5a2d9452dc3376f59be2a7a9519f7637b8e4f8cf6c0c55d710fe5bef6fc172aa7041fb6f3c5117ee25cbdd62c77141675e7afa14f1_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g161c2cf232bc6db2f4fc6e067089b95c6efc2ba821fe0356f392d399a6752665a23c487b7aa104dd19627b8c75ad84910cc9e7d7ffdb9870983393d497605d2d_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g5630e64607caf36e9f58c2cbc3c5b19869bc22745d300175bf8433102f49de0a2e179370eef0d5749cf8202f2d7e6a0c676073bc236bd29240cdb7c3ec2afc24_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/gd2cbd67f6496d4d9c43603abe53f25e17527e1ef1a43fee3e1172fa59bab06b2519e2bd8ca4da143025cbff3301a0b00328f1ec9ac4000c9e337075980be548b_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/ge62b8d6f2a951566e35077f7a15bddc2efebe230fab0b778d9569c8ff89dd5f5838738f0aa1e5b4d9f2daff334f6c312_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g84e311d381e2032eebf308b3f80971f4582565313870901dfad857485261dbddb7ab18be3435e0380a5f7504a442d841_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g0ee7d6ed4e900bdb41e893c68ff6041c68f98f6ae2eb41dea397ca11c2ec02fab8d7fe94fa3ed92571742ed47fdf0fc33e2ee8213016c56d14e81c7a1ef016e6_640.jpg",
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
    imagenUrl: "https://pixabay.com/get/g9cde212df792dfd07b95bcfc1534c5e173c0086d2880c4f2abcd29faff21be71062ff666f68b8b49120bcdcc1e4d62d43130fc9fcda0cdcabee86290bc738e60_640.jpg",
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