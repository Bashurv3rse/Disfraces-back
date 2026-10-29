/// <reference types="node" />

import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { elegirPiezas, proponerArmado, validarTallas } from "../src/modules/a-medida/armado.service";
import type { HuecoEntrada, InfoDonante, PiezaCandidata } from "../src/modules/a-medida/armado.service";

let pasaron = 0;
let fallaron = 0;

function comprobar(nombre: string, condicion: boolean, detalle?: string) {
  if (condicion) {
    pasaron++;
    console.log(`  ✔ ${nombre}`);
  } else {
    fallaron++;
    console.log(`  ✘ ${nombre}${detalle ? `  →  ${detalle}` : ""}`);
  }
}

const hueco = (id: string, etiqueta: string, tipo: string, extra: Partial<HuecoEntrada> = {}): HuecoEntrada => ({
  id,
  etiqueta,
  tipo,
  colores: [],
  nombreContiene: null,
  obligatoria: true,
  ...extra,
});

const pieza = (
  id: string,
  nombre: string,
  tipo: string,
  color: string,
  talla: string,
  origen: "ALMACEN" | "DISFRAZ" = "ALMACEN",
  disfrazId = "ALM",
  disfrazNombre = "Almacén"
): PiezaCandidata => ({ id, nombre, tipo, color, talla, origen, disfrazId, disfrazNombre });

const donante = (id: string, nombre: string, estado: string, disponiblesFamilia = 3): [string, InfoDonante] => [
  id,
  { id, nombre, estado, disponiblesFamilia },
];

function pruebasDeLogica() {
  console.log("\n=== Lógica con datos inventados ===");

  {
    console.log("\n1. Todo sale del almacén");
    const huecos = [
      hueco("h1", "Casco", "SOMBRERO", { colores: ["rojo", "amarillo"], nombreContiene: "casco" }),
      hueco("h2", "Camisa", "CAMISA", { colores: ["amarillo"] }),
      hueco("h3", "Botas", "ZAPATO", { nombreContiene: "botas" }),
    ];
    const almacen = [
      pieza("a1", "Casco amarillo", "SOMBRERO", "amarillo", "M"),
      pieza("a2", "Casco rojo", "SOMBRERO", "rojo", "M"),
      pieza("a3", "Camisa amarilla", "CAMISA", "amarillo", "M"),
      pieza("a4", "Botas negras", "ZAPATO", "negro", "40"),
    ];
    const r = elegirPiezas({ huecos, tallas: { ropa: "M", calzado: "40" }, almacen, donantes: [], infoDonantes: new Map() });
    comprobar("completo, 3 piezas, ninguna de otros disfraces", r.completo && r.piezas.length === 3 && r.piezasDeOtros === 0);
    comprobar("prefiere el primer color de la receta (rojo)", r.piezas[0]?.nombre === "Casco rojo");
  }

  {
    console.log("\n2. Toma de otro disfraz cuando el almacén no tiene");
    const huecos = [hueco("h1", "Camisa", "CAMISA", { colores: ["amarillo", "rojo"] })];
    const donantes = [pieza("d1", "Traje de Spiderman", "CAMISA", "rojo", "M", "DISFRAZ", "SP2", "Spider-Man #2")];
    const r = elegirPiezas({
      huecos,
      tallas: { ropa: "M" },
      almacen: [],
      donantes,
      infoDonantes: new Map([donante("SP2", "Spider-Man #2", "DISPONIBLE")]),
    });
    comprobar("completo con 1 pieza de otro disfraz", r.completo && r.piezasDeOtros === 1 && r.piezas[0]?.origen === "DISFRAZ");
    comprobar("avisa que ese disfraz deja de estar disponible", r.disfracesAfectados[0]?.pierdeDisponibilidad === true);
  }

  {
    console.log("\n3. Máximo de 2 piezas de otros disfraces");
    const huecos = [
      hueco("h1", "Camisa", "CAMISA", { colores: ["rojo"] }),
      hueco("h2", "Pantalón", "PANTALON", { colores: ["azul"] }),
      hueco("h3", "Botas", "ZAPATO", { nombreContiene: "botas" }),
    ];
    const donantes = [
      pieza("d1", "Camiseta", "CAMISA", "rojo", "M", "DISFRAZ", "A1", "Disfraz A #1"),
      pieza("d2", "Pantalón", "PANTALON", "azul", "M", "DISFRAZ", "B1", "Disfraz B #1"),
      pieza("d3", "Botas negras", "ZAPATO", "negro", "40", "DISFRAZ", "C1", "Disfraz C #1"),
    ];
    const r = elegirPiezas({
      huecos,
      tallas: { ropa: "M", calzado: "40" },
      almacen: [],
      donantes,
      infoDonantes: new Map([donante("A1", "Disfraz A #1", "DISPONIBLE"), donante("B1", "Disfraz B #1", "DISPONIBLE"), donante("C1", "Disfraz C #1", "DISPONIBLE")]),
    });
    comprobar("toma 2 y no arma el disfraz", r.piezasDeOtros === 2 && !r.completo && r.faltantes.length === 1);
    comprobar("explica el tope", r.faltantes[0]?.motivo.includes("el máximo es 2") ?? false, r.faltantes[0]?.motivo);
  }

  {
    console.log("\n4. Prefiere un donante que ya está incompleto");
    const huecos = [hueco("h1", "Camisa", "CAMISA", { colores: ["rojo"] })];
    const donantes = [
      pieza("d1", "Camiseta de fútbol", "CAMISA", "rojo", "M", "DISFRAZ", "FU2", "Futbolista #2"),
      pieza("d2", "Traje de Spiderman", "CAMISA", "rojo", "M", "DISFRAZ", "SP1", "Spider-Man #1"),
    ];
    const r = elegirPiezas({
      huecos,
      tallas: { ropa: "M" },
      almacen: [],
      donantes,
      infoDonantes: new Map([donante("FU2", "Futbolista #2", "DISPONIBLE"), donante("SP1", "Spider-Man #1", "INCOMPLETO")]),
    });
    comprobar("elige el incompleto aunque alfabéticamente iría después", r.piezas[0]?.disfrazOrigenNombre === "Spider-Man #1");
    comprobar("no cuesta ninguna venta", r.disfracesAfectados[0]?.pierdeDisponibilidad === false);
  }

  {
    console.log("\n5. Concentra las piezas en un solo disfraz donante");
    const huecos = [
      hueco("h1", "Camisa", "CAMISA", { colores: ["rojo"] }),
      hueco("h2", "Pantalón", "PANTALON", { colores: ["azul"] }),
    ];
    const donantes = [
      pieza("x1", "Camiseta", "CAMISA", "rojo", "M", "DISFRAZ", "X", "Disfraz X"),
      pieza("x2", "Pantalón", "PANTALON", "azul", "M", "DISFRAZ", "X", "Disfraz X"),
      pieza("y1", "Camiseta", "CAMISA", "rojo", "M", "DISFRAZ", "Y", "Aaa Y"),
      pieza("z1", "Pantalón", "PANTALON", "azul", "M", "DISFRAZ", "Z", "Aaa Z"),
    ];
    const r = elegirPiezas({
      huecos,
      tallas: { ropa: "M" },
      almacen: [],
      donantes,
      infoDonantes: new Map([donante("X", "Disfraz X", "DISPONIBLE"), donante("Y", "Aaa Y", "DISPONIBLE"), donante("Z", "Aaa Z", "DISPONIBLE")]),
    });
    comprobar("afecta a un solo disfraz (X) en vez de dos", r.disfracesAfectados.length === 1 && r.disfracesAfectados[0]?.nombre === "Disfraz X");
  }

  {
    console.log("\n6. Un hueco opcional sin stock no usa donantes");
    const huecos = [
      hueco("h1", "Camisa", "CAMISA", { colores: ["blanco"] }),
      hueco("h2", "Manguera", "ACCESORIO", { nombreContiene: "manguera", obligatoria: false }),
    ];
    const r = elegirPiezas({
      huecos,
      tallas: { ropa: "M" },
      almacen: [pieza("a1", "Camisa blanca", "CAMISA", "blanco", "M")],
      donantes: [pieza("d1", "Manguera de juguete", "ACCESORIO", "rojo", "única", "DISFRAZ", "BJ", "Bombero de juguete #1")],
      infoDonantes: new Map([donante("BJ", "Bombero de juguete #1", "DISPONIBLE")]),
    });
    comprobar("el armado sigue completo", r.completo && r.piezas.length === 1);
    comprobar("el opcional queda omitido y no se toca al donante", r.omitidas.length === 1 && r.piezasDeOtros === 0);
  }

  {
    console.log("\n7. Talla que no existe");
    const huecos = [hueco("h1", "Camisa", "CAMISA", { colores: ["blanco"] })];
    const almacen = [pieza("a1", "Camisa blanca", "CAMISA", "blanco", "M"), pieza("a2", "Camisa blanca", "CAMISA", "blanco", "L")];
    const r = elegirPiezas({ huecos, tallas: { ropa: "XL" }, almacen, donantes: [], infoDonantes: new Map() });
    comprobar("no completa y dice en qué tallas sí hay", !r.completo && r.faltantes[0]?.motivo === "No hay «Camisa» en talla XL. Hay en: M, L.", r.faltantes[0]?.motivo);
    comprobar("devuelve las tallas disponibles", JSON.stringify(r.faltantes[0]?.tallasDisponibles) === JSON.stringify(["M", "L"]));
  }

  {
    console.log("\n8. Ajuste de talla por pieza");
    const huecos = [hueco("h1", "Camisa", "CAMISA"), hueco("h2", "Botas", "ZAPATO")];
    const almacen = [
      pieza("a1", "Camisa blanca", "CAMISA", "blanco", "M"),
      pieza("a2", "Botas negras", "ZAPATO", "negro", "40"),
      pieza("a3", "Botas negras", "ZAPATO", "negro", "42"),
    ];
    const r = elegirPiezas({ huecos, tallas: { ropa: "M", calzado: "40", ajustes: { h2: "42" } }, almacen, donantes: [], infoDonantes: new Map() });
    comprobar("las botas salen en 42, no en 40", r.completo && r.piezas.find((p) => p.huecoId === "h2")?.talla === "42");
  }

  {
    console.log("\n9. Las piezas de talla única no piden talla");
    const huecos = [hueco("h1", "Pañuelo", "PANUELO", { colores: ["rojo"] })];
    comprobar("sin tallas no hay errores", validarTallas(huecos, {}).length === 0);
    const r = elegirPiezas({ huecos, tallas: {}, almacen: [pieza("a1", "Pañuelo rojo", "PANUELO", "rojo", "única")], donantes: [], infoDonantes: new Map() });
    comprobar("se cubre igualmente", r.completo && r.piezas.length === 1);
  }

  {
    console.log("\n10. Validación de tallas");
    const huecos = [hueco("h1", "Camisa", "CAMISA"), hueco("h2", "Botas", "ZAPATO"), hueco("h3", "Pañuelo", "PANUELO")];
    comprobar("falta el calzado", validarTallas(huecos, { ropa: "M" }).some((e) => e.includes("calzado")));
    comprobar("talla de ropa inválida", validarTallas(huecos, { ropa: "ZZ", calzado: "40" }).some((e) => e.includes("ZZ")));
    comprobar("acepta minúsculas", validarTallas(huecos, { ropa: "m", calzado: "40" }).length === 0);
    comprobar("ajuste a una pieza que no es de la receta", validarTallas(huecos, { ropa: "M", calzado: "40", ajustes: { fantasma: "L" } }).some((e) => e.includes("no está en esta receta")));
    comprobar("ajuste a una pieza de talla única", validarTallas(huecos, { ropa: "M", calzado: "40", ajustes: { h3: "M" } }).some((e) => e.includes("talla única")));
  }

  {
    console.log("\n11. Atiende primero al hueco con menos oferta");
    const huecos = [
      hueco("h1", "Camisa interior", "CAMISA", { colores: ["rojo"] }),
      hueco("h2", "Camisa exterior", "CAMISA", { colores: ["rojo", "azul"] }),
    ];
    const almacen = [pieza("a1", "Camisa roja", "CAMISA", "rojo", "M"), pieza("a2", "Camisa azul", "CAMISA", "azul", "M")];
    const r = elegirPiezas({ huecos, tallas: { ropa: "M" }, almacen, donantes: [], infoDonantes: new Map() });
    comprobar("ambos huecos quedan cubiertos (interior roja, exterior azul)", r.completo && r.piezas.find((p) => p.huecoId === "h1")?.color === "rojo" && r.piezas.find((p) => p.huecoId === "h2")?.color === "azul");
  }
}

async function propuestasReales() {
  console.log("\n=== Propuestas reales con tu base de datos (solo lectura) ===");

  const recetas = await prisma.receta.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } });
  if (recetas.length === 0) {
    console.log("No hay recetas. Corre antes: npx ts-node --project prisma/tsconfig.json prisma/sembrar-almacen.ts");
    return;
  }

  async function mostrar(titulo: string, recetaId: string, tallas: { ropa?: string; calzado?: string }) {
    console.log(`\n${titulo}`);
    try {
      const p = await proponerArmado(recetaId, tallas);
      console.log(
        `  ${p.receta.nombre}: ${p.completo ? "COMPLETO" : "INCOMPLETO"} · ${p.piezas.length} pieza(s) · ${p.piezasDeOtros} de otros disfraces · S/ ${p.receta.precioDia}/día`
      );
      for (const pz of p.piezas) {
        console.log(`    ${pz.etiqueta}: ${pz.nombre} (${pz.color}, ${pz.talla}) ← ${pz.disfrazOrigenNombre}`);
      }
      for (const f of p.faltantes) console.log(`    FALTA ${f.etiqueta}: ${f.motivo}`);
      for (const o of p.omitidas) console.log(`    (omitida) ${o.etiqueta}: ${o.motivo}`);
    } catch (error) {
      console.log(`  ERROR: ${(error as Error).message}`);
    }
  }

  for (const r of recetas) {
    await mostrar(`Talla ropa M / calzado 40 — ${r.nombre}`, r.id, { ropa: "M", calzado: "40" });
  }

  const bombero = recetas.find((r) => r.nombre === "Bombero");
  if (bombero) {
    await mostrar("Bombero con ropa XXL (el almacén no tiene esa talla)", bombero.id, { ropa: "XXL", calzado: "40" });
    await mostrar("Bombero con calzado 36 (el almacén empieza en 37)", bombero.id, { ropa: "M", calzado: "36" });
    await mostrar("Bombero sin indicar tallas (debe dar error)", bombero.id, {});
  }
}

pruebasDeLogica();
propuestasReales()
  .then(() => {
    console.log(`\nResultado de la lógica: ${pasaron} pasaron, ${fallaron} fallaron.`);
    process.exitCode = fallaron > 0 ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());