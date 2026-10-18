/// <reference types="node" />

import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { cotizar } from "../src/modules/pagos/precios.service";

async function caso(etiqueta: string, disfraces: string[], fechaInicio: string, fechaFin: string, codigo?: string) {
  console.log(`\n${etiqueta}`);
  try {
    const c = await cotizar({ disfraces, fechaInicio, fechaFin, codigo });
    console.log(
      `  días=${c.dias} | descuento=${c.descuento.toFixed(2)} | alquiler=${c.totalAlquiler.toFixed(2)} | garantía=${c.garantia.toFixed(2)} | total=${c.totalAPagar.toFixed(2)}`
    );
    if (c.detalleDescuento) console.log(`  ofertas: ${c.detalleDescuento}`);
    if (c.codigo) console.log(`  código: ${c.codigo.mensaje}`);
  } catch (error) {
    console.log(`  ERROR: ${(error as Error).message}`);
  }
}

async function main() {
  const rey = (await prisma.disfrazFisico.findFirstOrThrow({ where: { nombre: "Rey de Gala #1" } })).id;
  const spider = (await prisma.disfrazFisico.findFirstOrThrow({ where: { nombre: "Spider-Man #1" } })).id;
  const marinera = (await prisma.disfrazFisico.findFirstOrThrow({ where: { nombre: "Marinera Peruana #1" } })).id;

  await caso("A) Rey de Gala, 2 días, sin oferta", [rey], "2026-10-13", "2026-10-15");
  await caso("B) Rey de Gala, 3 días", [rey], "2026-10-14", "2026-10-17");
  await caso("C) Rey de Gala, 7 días", [rey], "2026-10-14", "2026-10-21");
  await caso("D) Spider-Man, empieza martes", [spider], "2026-10-13", "2026-10-15");
  await caso("E) Spider-Man + Marinera, empieza viernes", [spider, marinera], "2026-10-16", "2026-10-18");
  await caso("F) Rey de Gala + HALLOWEEN15", [rey], "2026-10-13", "2026-10-15", "HALLOWEEN15");
  await caso("G) Spider-Man, miércoles + HALLOWEEN15", [spider], "2026-10-14", "2026-10-16", "HALLOWEEN15");
  await caso("H) Spider-Man, martes + BIENVENIDA10", [spider], "2026-10-13", "2026-10-15", "BIENVENIDA10");
  await caso("I) Rey de Gala, 1 día + bienvenida10 (minúsculas)", [rey], "2026-10-14", "2026-10-15", "bienvenida10");
  await caso("J) Código inexistente", [rey], "2026-10-14", "2026-10-15", "NOEXISTE");
  await caso("K) Fechas invertidas", [rey], "2026-10-15", "2026-10-13");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });