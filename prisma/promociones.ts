import { PrismaClient } from "@prisma/client";

interface DefinicionPromocion {
  nombre: string;
  descripcion: string;
  porcentaje: number;
  codigo?: string;
  minDias?: number;
  diasSemana?: number[]; // 0 = domingo … 6 = sábado, evaluado sobre la fecha de INICIO
  tipoDisfraz?: string;
  temporadaEvento?: string;
}

const promociones: DefinicionPromocion[] = [
  {
    nombre: "Alquiler de 3 días o más",
    descripcion: "10% de descuento si alquilas 3 días o más.",
    porcentaje: 10,
    minDias: 3,
  },
  {
    nombre: "Alquiler de una semana",
    descripcion: "15% de descuento si alquilas 7 días o más.",
    porcentaje: 15,
    minDias: 7,
  },
  {
    nombre: "Martes de superhéroes",
    descripcion: "15% de descuento en disfraces de superhéroe si tu alquiler empieza un martes.",
    porcentaje: 15,
    diasSemana: [2],
    tipoDisfraz: "Superhéroe",
  },
  {
    nombre: "Viernes criollo",
    descripcion: "10% de descuento en disfraces de la temporada criolla si tu alquiler empieza un viernes.",
    porcentaje: 10,
    diasSemana: [5],
    temporadaEvento: "criollo",
  },
  {
    nombre: "Cupón de bienvenida",
    descripcion: "Código BIENVENIDA10: 10% de descuento en cualquier alquiler.",
    porcentaje: 10,
    codigo: "BIENVENIDA10",
  },
  {
    nombre: "Cupón de Halloween",
    descripcion: "Código HALLOWEEN15: 15% de descuento en disfraces de la temporada halloween.",
    porcentaje: 15,
    codigo: "HALLOWEEN15",
    temporadaEvento: "halloween",
  },
];

// Reemplaza todas las promociones por las de este archivo. No toca disfraces,
// alquileres ni ningún otro dato.
export async function sembrarPromociones(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    await tx.promocion.deleteMany();

    await tx.promocion.createMany({
      data: promociones.map((p) => ({
        nombre: p.nombre,
        descripcion: p.descripcion,
        porcentaje: p.porcentaje,
        codigo: p.codigo ?? null,
        minDias: p.minDias ?? null,
        diasSemana: p.diasSemana ?? [],
        tipoDisfraz: p.tipoDisfraz ?? null,
        temporadaEvento: p.temporadaEvento ?? null,
      })),
    });
  });

  console.log(`Promociones creadas: ${promociones.length}.`);
}