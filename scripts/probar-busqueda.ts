/// <reference types="node" />

import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { normalizar } from "../src/common/texto";
import { ErrorBusqueda, buscarRecetas, distancia, palabrasSignificativas, puntuar } from "../src/modules/a-medida/busqueda.service";
import { ErrorArmado } from "../src/modules/a-medida/armado.service";
import { previsualizar } from "../src/modules/a-medida/a-medida.service";

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

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pruebasPuras() {
  console.log("\n=== Reconocimiento de texto (sin base de datos) ===");
  const p = (texto: string, claves: string[]) => {
    const n = normalizar(texto);
    return puntuar(n, palabrasSignificativas(n), claves);
  };

  comprobar("distancia bombero / bombro = 1", distancia("bombero", "bombro") === 1);
  comprobar("distancia kitten / sitting = 3", distancia("kitten", "sitting") === 3);
  comprobar("distancia con texto vacío", distancia("", "abc") === 3);
  comprobar(
    "«quiero un disfraz de bombero» se reduce a «bombero»",
    igual(palabrasSignificativas(normalizar("Quiero un disfraz de bombero")), ["bombero"])
  );
  comprobar("«un disfraz» solo trae relleno", palabrasSignificativas(normalizar("un disfraz")).length === 0);
  comprobar("palabra exacta = 100", p("bombero", ["bombero"]) === 100);
  comprobar("con relleno, mayúsculas y signos = 100", p("¡Quiero un disfraz de BOMBERO!", ["bombero"]) === 100);
  comprobar("error de una letra = 70", p("bombro", ["bombero"]) === 70);
  comprobar("palabra sin relación = 0", p("piurano", ["bombero", "bomberos"]) === 0);
  comprobar("una frase clave solo cuenta si aparece completa", p("oficial policia", ["oficial de policia"]) === 0);
  comprobar("una palabra de 3 letras no se compara con tolerancia", p("bom", ["bombero"]) === 0);
  comprobar("las tildes no importan (médico = medico)", p("médico", ["medico"]) === 100);
}

async function main() {
  pruebasPuras();

  console.log("\n=== Con tu base de datos ===");
  const usuario = await prisma.usuario.findFirst({ where: { rol: "CLIENTE" }, select: { id: true, nombre: true } });
  if (!usuario) throw new Error("Hace falta al menos un usuario con rol CLIENTE.");
  console.log(`Usuario de prueba: ${usuario.nombre}`);

  const recetas = await prisma.receta.findMany({ select: { id: true, nombre: true } });
  const bombero = recetas.find((r) => r.nombre === "Bombero");
  if (!bombero) throw new Error("Falta la receta «Bombero». Corre: npx ts-node --project prisma/tsconfig.json prisma/sembrar-almacen.ts");

  const inicio = new Date();
  try {
    console.log("\nBúsqueda por texto");
    let r = await buscarRecetas(usuario.id, "bombero");
    comprobar("«bombero» → exacta: Bombero", r.resultado === "EXACTA" && r.recetas[0]?.nombre === "Bombero", r.resultado);

    r = await buscarRecetas(usuario.id, "Quiero un disfraz de BOMBERO!!");
    comprobar("frase larga con mayúsculas y signos → exacta: Bombero", r.resultado === "EXACTA" && r.recetas[0]?.nombre === "Bombero");

    r = await buscarRecetas(usuario.id, "bomberos");
    comprobar("«bomberos» (plural) → exacta", r.resultado === "EXACTA" && r.recetas[0]?.nombre === "Bombero");

    r = await buscarRecetas(usuario.id, "bombro");
    comprobar("«bombro» (error de tipeo) → parecida: Bombero", r.resultado === "PARECIDA" && r.recetas[0]?.nombre === "Bombero", r.resultado);

    r = await buscarRecetas(usuario.id, "médico");
    comprobar("«médico» → exacta: Doctor", r.resultado === "EXACTA" && r.recetas[0]?.nombre === "Doctor");

    r = await buscarRecetas(usuario.id, "cocinera");
    comprobar("«cocinera» → exacta: Chef", r.resultado === "EXACTA" && r.recetas[0]?.nombre === "Chef");

    r = await buscarRecetas(usuario.id, "piurano");
    comprobar(
      "«piurano» → sin receta, con sugerencias y aviso de que se registró",
      r.resultado === "SIN_RECETA" && r.recetas.length > 0 && r.mensaje.includes("Ya registramos"),
      `${r.resultado} / ${r.recetas.length} sugerencias`
    );

    let rechazo = 0;
    try {
      await buscarRecetas(usuario.id, "disfraz");
    } catch (error) {
      if (error instanceof ErrorBusqueda && error.estado === 400) rechazo++;
    }
    comprobar("«disfraz» solo (sin decir cuál) se rechaza con 400", rechazo === 1);

    r = await buscarRecetas(usuario.id, "marinera");
    comprobar("«marinera» → parecida: Marinero", r.resultado === "PARECIDA" && r.recetas[0]?.nombre === "Marinero", r.resultado);
    console.log(
      `  (catálogo para «marinera»: ${r.catalogo.map((c) => `${c.familia} ×${c.disponibles}`).join(", ") || "nada disponible"})`
    );

    console.log("\nRegistro de peticiones");
    await buscarRecetas(usuario.id, "piurano"); // repetida
    const filasPiurano = await prisma.peticionDisfraz.count({ where: { usuarioId: usuario.id, textoNormalizado: "piurano", creadoEn: { gte: inicio } } });
    comprobar("pedir lo mismo dos veces seguidas no duplica la petición", filasPiurano === 1, `filas=${filasPiurano}`);

    const pBombero = await prisma.peticionDisfraz.findFirst({ where: { usuarioId: usuario.id, textoNormalizado: "bombero", creadoEn: { gte: inicio } } });
    const pPiurano = await prisma.peticionDisfraz.findFirst({ where: { usuarioId: usuario.id, textoNormalizado: "piurano", creadoEn: { gte: inicio } } });
    comprobar(
      "la petición de «bombero» queda ligada a su receta y la de «piurano» sin receta",
      pBombero?.recetaId === bombero.id && pPiurano?.recetaId === null
    );

    console.log("\nVista del cliente (propuesta sin reservar)");
    const TALLAS = { ropa: "M", calzado: "40" };
    const v = await previsualizar(bombero.id, TALLAS);
    comprobar("Bombero con ropa M y calzado 40: completo, 5 piezas", v.completo && v.piezas.length === 5, `${v.piezas.length} piezas`);
    comprobar("la vista no revela de qué disfraz sale cada pieza", !JSON.stringify(v).includes("disfrazOrigen"));

    const op = (etiqueta: string) => v.opciones.find((o) => o.etiqueta === etiqueta)?.tallas ?? [];
    comprobar("opciones del Casco: S, M, L, XL", igual(op("Casco"), ["S", "M", "L", "XL"]), JSON.stringify(op("Casco")));
    comprobar("opciones de las Botas: 37 a 42", igual(op("Botas"), ["37", "38", "39", "40", "41", "42"]), JSON.stringify(op("Botas")));

    const xxl = await previsualizar(bombero.id, { ropa: "XXL", calzado: "40" });
    comprobar(
      "con ropa XXL: incompleto, faltan 3 piezas y cada una dice qué tallas sí hay",
      !xxl.completo && xxl.faltantes.length === 3 && xxl.faltantes.every((f) => f.tallasDisponibles.length > 0),
      `faltantes=${xxl.faltantes.length}`
    );

    let sinTallas = "";
    try {
      await previsualizar(bombero.id, {});
    } catch (error) {
      if (error instanceof ErrorArmado && error.estado === 400) sinTallas = error.message;
    }
    comprobar("sin indicar tallas: error 400 pidiendo la talla de ropa", sinTallas.includes("Indica tu talla de ropa"), sinTallas);
  } finally {
    // Se borra lo que esta prueba registró.
    await prisma.peticionDisfraz.deleteMany({ where: { usuarioId: usuario.id, creadoEn: { gte: inicio } } });
  }
}

main()
  .then(() => {
    console.log(`\nResultado: ${pasaron} pasaron, ${fallaron} fallaron.`);
    process.exitCode = fallaron > 0 ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());