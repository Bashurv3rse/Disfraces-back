/// <reference types="node" />

import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import { prisma } from "../src/config/prisma";
import { obtenerDisfrazConEstado } from "../src/modules/disfraces/disfraces.service";
import { deshacerMovimientos, liberarReservasVencidas, obtenerReservadosIds } from "../src/modules/a-medida/reservas.base";
import {
  ErrorReserva,
  cancelarReserva,
  confirmarReserva,
  extenderReserva,
  reservarAMedida,
} from "../src/modules/a-medida/reservas.service";

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

// «Huella» de la ubicación de todas las piezas: si dos huellas son iguales, ninguna pieza se movió.
async function huella(): Promise<string> {
  const prendas = await prisma.prenda.findMany({
    select: { id: true, disfrazActualId: true },
    orderBy: { id: "asc" },
  });
  return createHash("sha1")
    .update(prendas.map((p) => `${p.id}:${p.disfrazActualId}`).join("|"))
    .digest("hex");
}

async function sinRastro(reservaId: string, disfrazId: string): Promise<boolean> {
  const reserva = await prisma.reserva.findUnique({ where: { id: reservaId } });
  const disfraz = await prisma.disfrazFisico.findUnique({ where: { id: disfrazId } });
  return reserva === null && disfraz === null;
}

const minutosHasta = (fecha: Date) => (fecha.getTime() - Date.now()) / 60_000;

async function main() {
  const usuario = await prisma.usuario.findFirst({ where: { rol: "CLIENTE" }, select: { id: true, nombre: true } });
  if (!usuario) throw new Error("Hace falta al menos un usuario con rol CLIENTE.");

  const recetas = new Map((await prisma.receta.findMany()).map((r) => [r.nombre, r.id] as const));
  for (const nombre of ["Bombero", "Policía", "Chef", "Doctor", "Astronauta"]) {
    if (!recetas.has(nombre)) {
      throw new Error(`Falta la receta «${nombre}». Corre: npx ts-node --project prisma/tsconfig.json prisma/sembrar-almacen.ts`);
    }
  }

  await liberarReservasVencidas();
  const previas = await prisma.reserva.count();
  const previasAMedida = await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } });
  if (previas > 0 || previasAMedida > 0) {
    throw new Error("Ya hay reservas o disfraces a medida en la base de datos. Cancélalos o bórralos antes de correr esta prueba.");
  }

  const TALLAS = { ropa: "M", calzado: "40" };
  const inicial = await huella();
  console.log(`Usuario de prueba: ${usuario.nombre}`);

  // ---------------------------------------------------------------
  console.log("\n1. Reservar un disfraz a medida");
  const r1 = await reservarAMedida(usuario.id, recetas.get("Bombero")!, TALLAS, "quiero un disfraz de bombero");
  const movimientos = await prisma.movimientoPrenda.count({ where: { reservaId: r1.reservaId } });
  const piezasEnElDisfraz = await prisma.prenda.count({ where: { disfrazActualId: r1.disfrazId } });
  comprobar("mueve las 5 piezas del Bombero y anota 5 movimientos", movimientos === 5 && piezasEnElDisfraz === 5, `movimientos=${movimientos}, piezas=${piezasEnElDisfraz}`);

  const detalle = await obtenerDisfrazConEstado(r1.disfrazId);
  comprobar("el disfraz figura como RESERVADO", detalle?.estado === "RESERVADO", String(detalle?.estado));
  comprobar(
    "es un disfraz A_MEDIDA con el precio de la receta (S/ 35)",
    detalle?.origen === "A_MEDIDA" && Number(detalle.precioAlquiler) === 35
  );
  comprobar("la reserva vence en unos 20 minutos", Math.abs(minutosHasta(r1.vence) - 20) < 1, `${minutosHasta(r1.vence).toFixed(1)} min`);
  comprobar(
    "para otros está reservado; para su dueña no cuenta como ocupado",
    (await obtenerReservadosIds()).has(r1.disfrazId) && !(await obtenerReservadosIds(usuario.id)).has(r1.disfrazId)
  );

  // ---------------------------------------------------------------
  console.log("\n2. Cancelar la reserva");
  await cancelarReserva(r1.reservaId, usuario.id);
  comprobar("todas las piezas vuelven a su lugar exacto", (await huella()) === inicial);
  comprobar("no queda ni la reserva ni el disfraz temporal", await sinRastro(r1.reservaId, r1.disfrazId));

  // ---------------------------------------------------------------
  console.log("\n3. Reserva vencida sin pagar");
  const r2 = await reservarAMedida(usuario.id, recetas.get("Policía")!, TALLAS);
  await prisma.reserva.update({ where: { id: r2.reservaId }, data: { vence: new Date(Date.now() - 60_000) } });
  const liberadas = await liberarReservasVencidas();
  comprobar("libera exactamente 1 reserva vencida", liberadas === 1, `liberadas=${liberadas}`);
  comprobar("las piezas vuelven y no queda rastro", (await huella()) === inicial && (await sinRastro(r2.reservaId, r2.disfrazId)));

  // ---------------------------------------------------------------
  console.log("\n4. Reserva confirmada (pagada)");
  const r3 = await reservarAMedida(usuario.id, recetas.get("Chef")!, TALLAS);
  let idempotente = true;
  try {
    await confirmarReserva(r3.reservaId, usuario.id);
    await confirmarReserva(r3.reservaId, usuario.id);
  } catch {
    idempotente = false;
  }
  comprobar("confirmarla dos veces no da error", idempotente);

  await prisma.reserva.update({ where: { id: r3.reservaId }, data: { vence: new Date(Date.now() - 60_000) } });
  const liberadasConfirmada = await liberarReservasVencidas();
  const piezasChef = await prisma.prenda.count({ where: { disfrazActualId: r3.disfrazId } });
  comprobar(
    "una reserva confirmada NO se libera aunque pase su plazo",
    liberadasConfirmada === 0 && piezasChef === 4,
    `liberadas=${liberadasConfirmada}, piezas=${piezasChef}`
  );
  comprobar("ya no figura como reservada (está pagada)", !(await obtenerReservadosIds()).has(r3.disfrazId));

  let canceladaYaConfirmada = false;
  try {
    await cancelarReserva(r3.reservaId, usuario.id);
  } catch (error) {
    canceladaYaConfirmada = error instanceof ErrorReserva;
  }
  comprobar("no se puede cancelar una reserva ya confirmada", canceladaYaConfirmada);

  // Desarme manual (lo que automatizará la parte 8): deshacer los movimientos y borrar el rastro.
  await prisma.$transaction(async (tx) => {
    await deshacerMovimientos(tx, r3.reservaId);
  });
  await prisma.reserva.delete({ where: { id: r3.reservaId } });
  await prisma.disfrazFisico.delete({ where: { id: r3.disfrazId } });
  comprobar("al desarmarla, las piezas vuelven a su lugar exacto", (await huella()) === inicial);

  // ---------------------------------------------------------------
  console.log("\n5. Ampliar el plazo e intentos ajenos");
  const r4 = await reservarAMedida(usuario.id, recetas.get("Doctor")!, TALLAS);
  const antes = (await prisma.reserva.findUniqueOrThrow({ where: { id: r4.reservaId } })).vence;
  await extenderReserva(r4.reservaId, usuario.id);
  const despues = (await prisma.reserva.findUniqueOrThrow({ where: { id: r4.reservaId } })).vence;
  comprobar("al iniciar el pago el plazo pasa a ~45 minutos", despues > antes && Math.abs(minutosHasta(despues) - 45) < 1, `${minutosHasta(despues).toFixed(1)} min`);

  const ajeno = randomUUID();
  let ajenoRechazado = 0;
  try {
    await extenderReserva(r4.reservaId, ajeno);
  } catch (error) {
    if (error instanceof ErrorReserva) ajenoRechazado++;
  }
  try {
    await cancelarReserva(r4.reservaId, ajeno);
  } catch (error) {
    if (error instanceof ErrorReserva) ajenoRechazado++;
  }
  comprobar("otra persona no puede ampliar ni cancelar esa reserva", ajenoRechazado === 2);
  await cancelarReserva(r4.reservaId, usuario.id);

  // ---------------------------------------------------------------
  console.log("\n6. Límite de reservas sin pagar");
  const hechas: Awaited<ReturnType<typeof reservarAMedida>>[] = [];
  try {
    for (const nombre of ["Bombero", "Policía", "Chef"]) {
      hechas.push(await reservarAMedida(usuario.id, recetas.get(nombre)!, TALLAS));
    }
  } catch (error) {
    comprobar("reserva 3 disfraces distintos sin pagar", false, (error as Error).message);
  }

  if (hechas.length === 3) {
    comprobar("reserva 3 disfraces distintos sin pagar", true);
    let mensajeLimite = "";
    try {
      await reservarAMedida(usuario.id, recetas.get("Doctor")!, TALLAS);
    } catch (error) {
      mensajeLimite = (error as Error).message;
    }
    comprobar("la cuarta reserva sin pagar se rechaza", mensajeLimite.includes("Ya tienes 3"), mensajeLimite);
  }
  for (const r of hechas) await cancelarReserva(r.reservaId, usuario.id);
  comprobar("al cancelarlas todas, las piezas vuelven a su lugar exacto", (await huella()) === inicial);

  // ---------------------------------------------------------------
  console.log("\n7. Tres personas pidiendo el mismo disfraz a la vez (solo hay 2 de cada pieza)");
  const resultados = await Promise.allSettled(
    [1, 2, 3].map(() => reservarAMedida(usuario.id, recetas.get("Astronauta")!, TALLAS))
  );
  const exitos = resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const fallos = resultados.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
  console.log(`  (resultado: ${exitos.length} reservas logradas y ${fallos.length} rechazadas)`);

  comprobar("se logran entre 1 y 2 reservas, nunca 3", exitos.length >= 1 && exitos.length <= 2);
  comprobar(
    "los rechazos son errores controlados (409), no errores internos",
    fallos.every((f) => f instanceof ErrorReserva && f.estado === 409),
    fallos.map((f) => (f as Error).message).join(" | ")
  );

  const piezasPorReserva = await Promise.all(
    exitos.map((e) => prisma.prenda.findMany({ where: { disfrazActualId: e.disfrazId }, select: { id: true } }))
  );
  const todas = piezasPorReserva.flat().map((p) => p.id);
  comprobar("ninguna pieza está en dos disfraces a la vez", new Set(todas).size === todas.length);
  comprobar("cada reserva lograda tiene sus 4 piezas completas", piezasPorReserva.every((lista) => lista.length === 4));

  for (const e of exitos) await cancelarReserva(e.reservaId, usuario.id);
  const reservasRestantes = await prisma.reserva.count();
  const aMedidaRestantes = await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } });
  comprobar(
    "al terminar todo vuelve a su lugar, sin reservas ni disfraces a medida",
    (await huella()) === inicial && reservasRestantes === 0 && aMedidaRestantes === 0
  );

  // ---------------------------------------------------------------
  if (process.argv.includes("--mantener")) {
    const viva = await reservarAMedida(usuario.id, recetas.get("Bombero")!, TALLAS, "reserva de demostración");
    console.log("\nSe dejó UNA reserva de Bombero activa (vence en ~20 minutos):");
    console.log(`  disfraz: ${viva.nombre}`);
    console.log("  Mira la pantalla Almacén: debe mostrar piezas «en uso». Cuando venza, se libera sola");
    console.log("  la próxima vez que alguien cargue el catálogo, el almacén o las recetas.");
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