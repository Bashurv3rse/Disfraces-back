/// <reference types="node" />

import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import { prisma } from "../src/config/prisma";
import { crearAlquiler } from "../src/modules/alquileres/alquileres.service";
import { ErrorDevolucion, crearDevolucion } from "../src/modules/devoluciones/devoluciones.service";
import { limpiarSuspensionesVencidas } from "../src/modules/disfraces/disfraces.service";
import { deshacerMovimientos, desarmarReservasTerminadas, liberarReservasVencidas } from "../src/modules/a-medida/reservas.base";
import { reservarAMedida } from "../src/modules/a-medida/reservas.service";

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

async function capturar(accion: () => Promise<unknown>): Promise<unknown> {
  try {
    await accion();
    return null;
  } catch (error) {
    return error;
  }
}

const descripcion = (e: unknown) => (e instanceof Error ? e.message : e === null ? "no lanzó ningún error" : String(e));
const esErrorDevolucion = (e: unknown, estado: number) => e instanceof ErrorDevolucion && e.estado === estado;

async function huella(): Promise<string> {
  const prendas = await prisma.prenda.findMany({ select: { id: true, disfrazActualId: true }, orderBy: { id: "asc" } });
  return createHash("sha1")
    .update(prendas.map((p) => `${p.id}:${p.disfrazActualId}`).join("|"))
    .digest("hex");
}

async function limpiar(
  alquileres: string[],
  reservas: { reservaId: string; disfrazId: string }[],
  prendasTocadas: string[]
) {
  if (prendasTocadas.length > 0) {
    await prisma.prenda.updateMany({ where: { id: { in: prendasTocadas } }, data: { estado: "DISPONIBLE" } });
  }
  if (alquileres.length > 0) {
    await prisma.devolucionPrenda.deleteMany({ where: { devolucion: { alquilerId: { in: alquileres } } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: alquileres } } });
  }
  for (const { reservaId, disfrazId } of reservas) {
    try {
      await prisma.$transaction(async (tx) => {
        await deshacerMovimientos(tx, reservaId);
        await tx.reserva.deleteMany({ where: { id: reservaId } });
        await tx.disfrazFisico.deleteMany({ where: { id: disfrazId, origen: "A_MEDIDA" } });
      });
    } catch (error) {
      console.warn(`  (aviso) no se pudo limpiar la reserva ${reservaId}:`, (error as Error).message);
    }
  }
}

async function main() {
  const usuario = await prisma.usuario.findFirst({ where: { rol: "CLIENTE" }, select: { id: true, nombre: true } });
  if (!usuario) throw new Error("Hace falta al menos un usuario con rol CLIENTE.");

  const bombero = await prisma.receta.findUnique({ where: { nombre: "Bombero" } });
  if (!bombero) throw new Error("Falta la receta «Bombero». Corre: npx ts-node --project prisma/tsconfig.json prisma/sembrar-almacen.ts");

  await liberarReservasVencidas();
  if ((await prisma.reserva.count()) > 0 || (await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } })) > 0) {
    throw new Error("Ya hay reservas o disfraces a medida en la base de datos. Cancélalos o vuelve a correr la seed antes de esta prueba.");
  }

  const alquileresAntes = await prisma.alquiler.count();
  const inicial = await huella();
  const TALLAS = { ropa: "M", calzado: "40" };
  const FECHAS = { fechaInicio: "2026-10-21", fechaFin: "2026-10-24" };

  console.log(`Usuario de prueba: ${usuario.nombre}`);

  const alquileres: string[] = [];
  const reservas: { reservaId: string; disfrazId: string }[] = [];
  const prendasTocadas: string[] = [];

  try {
    // ---------------------------------------------------------------
    console.log("\n1. Un disfraz a medida pagado y alquilado");
    const r1 = await reservarAMedida(usuario.id, bombero.id, TALLAS, "prueba de desarmado");
    reservas.push({ reservaId: r1.reservaId, disfrazId: r1.disfrazId });
    const a1 = await crearAlquiler({ ...FECHAS, disfraces: [r1.disfrazId] }, usuario.id, { reservasIds: [r1.reservaId] });
    alquileres.push(a1.id);

    const prendas1 = await prisma.prenda.findMany({ where: { disfrazActualId: r1.disfrazId }, select: { id: true } });
    comprobar("el Bombero a medida tiene sus 5 piezas", prendas1.length === 5, `${prendas1.length} piezas`);

    const desarmadasAlquilado = await desarmarReservasTerminadas();
    const sigueArmado = await prisma.prenda.count({ where: { disfrazActualId: r1.disfrazId } });
    comprobar("mientras está alquilado NO se desarma", desarmadasAlquilado === 0 && sigueArmado === 5, `desarmadas=${desarmadasAlquilado}, piezas=${sigueArmado}`);

    // ---------------------------------------------------------------
    console.log("\n2. La devolución rechaza reportes que no corresponden");
    const completo: { prendaId: string; estadoPrenda: "BUEN_ESTADO" | "DANADA" }[] = prendas1.map((p) => ({
      prendaId: p.id,
      estadoPrenda: "BUEN_ESTADO",
    }));
    const ajena = await prisma.prenda.findFirstOrThrow({ where: { disfrazActual: { origen: "ALMACEN" } }, select: { id: true } });
    const devolver = (prendas: typeof completo, usuarioId: string = usuario.id) =>
      crearDevolucion({ alquilerId: a1.id, fechaDevolucion: new Date().toISOString(), prendas }, usuarioId);

    let e = await capturar(() => devolver([...completo, { prendaId: ajena.id, estadoPrenda: "DANADA" }]));
    comprobar("una prenda ajena en el reporte se rechaza (400)", esErrorDevolucion(e, 400), descripcion(e));

    e = await capturar(() => devolver(completo.slice(1)));
    comprobar("un reporte incompleto se rechaza (400)", esErrorDevolucion(e, 400), descripcion(e));

    e = await capturar(() => devolver([completo[0], completo[0], ...completo.slice(2)]));
    comprobar("prendas repetidas se rechazan (400)", esErrorDevolucion(e, 400), descripcion(e));

    e = await capturar(() => devolver(completo, randomUUID()));
    comprobar("otra persona no puede devolver este alquiler (404)", esErrorDevolucion(e, 404), descripcion(e));

    const alquilerIntacto = await prisma.alquiler.findUniqueOrThrow({ where: { id: a1.id } });
    const devoluciones = await prisma.devolucion.count({ where: { alquilerId: a1.id } });
    comprobar("tras los intentos inválidos el alquiler sigue ACTIVO y sin devolución", alquilerIntacto.estado === "ACTIVO" && devoluciones === 0);

    // ---------------------------------------------------------------
    console.log("\n3. Devolución válida con una pieza dañada");
    prendasTocadas.push(prendas1[0].id);
    const reporte = prendas1.map((p, i) => ({ prendaId: p.id, estadoPrenda: (i === 0 ? "DANADA" : "BUEN_ESTADO") as "DANADA" | "BUEN_ESTADO" }));
    const resultado = await crearDevolucion(
      { alquilerId: a1.id, fechaDevolucion: new Date().toISOString(), prendas: reporte },
      usuario.id
    );
    comprobar("no hay sustituciones: un disfraz a medida no recibe reemplazos", resultado.sustituciones.length === 0);

    const alquilerFinal = await prisma.alquiler.findUniqueOrThrow({ where: { id: a1.id } });
    const disfraz = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: r1.disfrazId } });
    comprobar("el alquiler queda FINALIZADO", alquilerFinal.estado === "FINALIZADO", String(alquilerFinal.estado));
    comprobar("el disfraz entra en lavado (SUSPENDIDO con fecha)", disfraz.estadoManual === "SUSPENDIDO" && disfraz.fechaSuspension !== null);

    e = await capturar(() => devolver(reporte as typeof completo));
    comprobar("devolver dos veces el mismo alquiler se rechaza (409)", esErrorDevolucion(e, 409), descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n4. Durante el lavado no se desarma");
    const desarmadasLavado = await desarmarReservasTerminadas();
    const piezasLavado = await prisma.prenda.count({ where: { disfrazActualId: r1.disfrazId } });
    comprobar("las piezas siguen en el disfraz", desarmadasLavado === 0 && piezasLavado === 5, `desarmadas=${desarmadasLavado}, piezas=${piezasLavado}`);

    // ---------------------------------------------------------------
    console.log("\n5. Al terminar el lavado se desarma solo");
    await prisma.disfrazFisico.update({
      where: { id: r1.disfrazId },
      data: { fechaSuspension: new Date(Date.now() - 10 * 86_400_000) },
    });
    await limpiarSuspensionesVencidas();

    const reservaFinal = await prisma.reserva.findUniqueOrThrow({ where: { id: r1.reservaId } });
    const disfrazFinal = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: r1.disfrazId } });
    comprobar("el lavado terminó y la reserva quedó marcada como liberada", disfrazFinal.estadoManual === null && reservaFinal.liberadaEn !== null);
    comprobar("todas las piezas volvieron a su lugar exacto", (await huella()) === inicial);

    const danada = await prisma.prenda.findUniqueOrThrow({ where: { id: prendas1[0].id } });
    comprobar(
      "la pieza dañada volvió a su origen CON su estado «dañada»",
      danada.estado === "DANADA" && danada.disfrazActualId === danada.disfrazHogarId,
      `estado=${danada.estado}`
    );

    const movimientos = await prisma.movimientoPrenda.count({ where: { reservaId: r1.reservaId } });
    comprobar("el historial se conserva (reserva, disfraz temporal y 5 movimientos)", movimientos === 5);

    const otraVez = await desarmarReservasTerminadas();
    comprobar("repetir el desarmado no hace nada", otraVez === 0 && (await huella()) === inicial, `desarmadas=${otraVez}`);
  } finally {
    await limpiar(alquileres, reservas, prendasTocadas);
  }

  // ---------------------------------------------------------------
  console.log("\n6. Todo quedó como estaba");
  comprobar("todas las piezas en su lugar", (await huella()) === inicial);
  const reservasRestantes = await prisma.reserva.count();
  const aMedidaRestantes = await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } });
  const alquileresDespues = await prisma.alquiler.count();
  comprobar(
    "no queda ningún alquiler, reserva ni disfraz a medida de la prueba",
    reservasRestantes === 0 && aMedidaRestantes === 0 && alquileresDespues === alquileresAntes,
    `reservas=${reservasRestantes}, a medida=${aMedidaRestantes}, alquileres ${alquileresAntes}→${alquileresDespues}`
  );
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