/// <reference types="node" />

import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import { prisma } from "../src/config/prisma";
import { ErrorCotizacion, cotizar } from "../src/modules/pagos/precios.service";
import { prepararCarrito, validarSoloCatalogo } from "../src/modules/pagos/carrito.service";
import { crearAlquiler } from "../src/modules/alquileres/alquileres.service";
import { obtenerDisfrazConEstado } from "../src/modules/disfraces/disfraces.service";
import {
  ReservaPerdida,
  deshacerMovimientos,
  liberarReservasVencidas,
  liberarSinConfirmar,
} from "../src/modules/a-medida/reservas.base";
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

// Devuelve el error que lanza la acción, o null si no lanza ninguno.
async function capturar(accion: () => Promise<unknown>): Promise<unknown> {
  try {
    await accion();
    return null;
  } catch (error) {
    return error;
  }
}

const descripcion = (e: unknown) => (e instanceof Error ? e.message : e === null ? "no lanzó ningún error" : String(e));
const esErrorCotizacion = (e: unknown, estado: number) => e instanceof ErrorCotizacion && e.estado === estado;
const casi = (a: number, b: number) => Math.abs(a - b) < 0.005;

// «Huella» de la ubicación de todas las piezas: si dos huellas son iguales, ninguna pieza se movió.
async function huella(): Promise<string> {
  const prendas = await prisma.prenda.findMany({ select: { id: true, disfrazActualId: true }, orderBy: { id: "asc" } });
  return createHash("sha1")
    .update(prendas.map((p) => `${p.id}:${p.disfrazActualId}`).join("|"))
    .digest("hex");
}

// Borra lo que creó la prueba: primero los alquileres, y luego cada reserva con su disfraz
// temporal, devolviendo las piezas a su lugar. Funciona aunque la reserva ya no exista.
async function limpiar(alquileres: string[], reservas: { reservaId: string; disfrazId: string }[]) {
  if (alquileres.length > 0) {
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

  const recetas = new Map((await prisma.receta.findMany()).map((r) => [r.nombre, r.id] as const));
  for (const nombre of ["Bombero", "Policía", "Chef", "Doctor"]) {
    if (!recetas.has(nombre)) {
      throw new Error(`Falta la receta «${nombre}». Corre: npx ts-node --project prisma/tsconfig.json prisma/sembrar-almacen.ts`);
    }
  }
  if ((await prisma.promocion.count()) === 0) {
    throw new Error("Faltan las promociones. Corre: npx ts-node --project prisma/tsconfig.json prisma/sembrar-promociones.ts");
  }

  const reyDeGala = await prisma.disfrazFisico.findFirstOrThrow({ where: { nombre: "Rey de Gala #1" } });
  const almacen = await prisma.disfrazFisico.findFirstOrThrow({ where: { origen: "ALMACEN" } });

  await liberarReservasVencidas();
  if ((await prisma.reserva.count()) > 0 || (await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } })) > 0) {
    throw new Error("Ya hay reservas o disfraces a medida en la base de datos. Cancélalos o vuelve a correr la seed antes de esta prueba.");
  }

  const alquileresAntes = await prisma.alquiler.count();
  const inicial = await huella();
  const TALLAS = { ropa: "M", calzado: "40" };
  // El 21 de octubre de 2026 es miércoles: ninguna oferta por día de la semana interfiere.
  const FECHAS = { fechaInicio: "2026-10-21", fechaFin: "2026-10-24" };

  console.log(`Usuario de prueba: ${usuario.nombre}`);

  const alquileresCreados: string[] = [];
  const reservasLimpiar: { reservaId: string; disfrazId: string }[] = [];
  const registrar = (r: { reservaId: string; disfrazId: string }) => {
    reservasLimpiar.push({ reservaId: r.reservaId, disfrazId: r.disfrazId });
    return r;
  };
  const alquileresDe = (disfrazId: string) => prisma.alquilerDisfraz.count({ where: { disfrazFisicoId: disfrazId } });

  try {
    // ---------------------------------------------------------------
    console.log("\n1. Qué se puede poner en el carrito");
    let carrito = await prepararCarrito([reyDeGala.id], usuario.id);
    comprobar("un disfraz del catálogo entra sin reservas", carrito.reservas.length === 0);

    let e = await capturar(() => prepararCarrito([almacen.id], usuario.id));
    comprobar("el almacén no se puede poner en el carrito (400)", esErrorCotizacion(e, 400), descripcion(e));

    e = await capturar(() => prepararCarrito([randomUUID()], usuario.id));
    comprobar("un artículo que no existe se rechaza (409)", esErrorCotizacion(e, 409), descripcion(e));

    const r1 = registrar(await reservarAMedida(usuario.id, recetas.get("Bombero")!, TALLAS, "prueba de integración"));
    carrito = await prepararCarrito([r1.disfrazId], usuario.id);
    comprobar(
      "un disfraz a medida con reserva vigente a su nombre entra",
      carrito.reservas.length === 1 && carrito.reservas[0].reservaId === r1.reservaId
    );
    const segundos = carrito.reservas[0]?.segundosRestantes ?? 0;
    comprobar("la reserva trae su cuenta regresiva (~20 minutos)", segundos > 1100 && segundos <= 1200, `${segundos} s`);

    e = await capturar(() => prepararCarrito([r1.disfrazId], randomUUID()));
    comprobar(
      "otra persona no puede pagar esa reserva (409)",
      esErrorCotizacion(e, 409) && descripcion(e).includes("a tu nombre"),
      descripcion(e)
    );

    carrito = await prepararCarrito([reyDeGala.id, r1.disfrazId], usuario.id);
    comprobar("un carrito mixto (catálogo + a medida) entra y trae 1 reserva", carrito.reservas.length === 1);

    e = await capturar(() => validarSoloCatalogo([r1.disfrazId]));
    comprobar("el alquiler directo del admin rechaza un disfraz a medida (400)", esErrorCotizacion(e, 400), descripcion(e));
    e = await capturar(() => validarSoloCatalogo([reyDeGala.id]));
    comprobar("el alquiler directo del admin acepta uno del catálogo", e === null, descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n2. Cotización con un disfraz a medida");
    const c1 = await cotizar({ disfraces: [r1.disfrazId], ...FECHAS });
    comprobar("3 días × S/ 35 = S/ 105 de subtotal", c1.dias === 3 && casi(c1.subtotal, 105), `días=${c1.dias}, subtotal=${c1.subtotal}`);
    comprobar(
      "la oferta de 3 días aplica al disfraz a medida: −10.50 y alquiler 94.50",
      casi(c1.descuento, 10.5) && casi(c1.totalAlquiler, 94.5) && c1.lineas[0]?.promocion?.porcentaje === 10,
      `descuento=${c1.descuento}, alquiler=${c1.totalAlquiler}`
    );
    comprobar(
      "garantía 25% sobre lo ya descontado (23.63) y total a pagar 118.13",
      casi(c1.garantia, 23.63) && casi(c1.totalAPagar, 118.13) && c1.centavos.totalAlquiler === 9450 && c1.centavos.garantia === 2363,
      `garantía=${c1.garantia}, total=${c1.totalAPagar}`
    );

    const c2 = await cotizar({ disfraces: [r1.disfrazId], ...FECHAS, codigo: "BIENVENIDA10" });
    comprobar(
      "BIENVENIDA10 es válido pero no se acumula (la oferta automática ya da 10%)",
      c2.codigo?.valido === true && c2.codigo?.aplicado === false && casi(c2.totalAlquiler, 94.5),
      JSON.stringify(c2.codigo)
    );

    const c3 = await cotizar({ disfraces: [reyDeGala.id, r1.disfrazId], ...FECHAS });
    comprobar(
      "carrito mixto: alquiler 243.00, garantía 60.75, total 303.75",
      casi(c3.totalAlquiler, 243) && casi(c3.garantia, 60.75) && casi(c3.totalAPagar, 303.75),
      `alquiler=${c3.totalAlquiler}, garantía=${c3.garantia}, total=${c3.totalAPagar}`
    );

    // ---------------------------------------------------------------
    console.log("\n3. Alquiler con reservas en una sola transacción");
    const alquiler = await crearAlquiler(
      { ...FECHAS, evento: "prueba de integración", disfraces: [r1.disfrazId] },
      usuario.id,
      { stripeSessionId: `prueba-${randomUUID()}`, reservasIds: [r1.reservaId] }
    );
    alquileresCreados.push(alquiler.id);

    comprobar("se crea el alquiler ACTIVO", alquiler.estado === "ACTIVO", String(alquiler.estado));
    comprobar(
      "guarda lo cotizado: total 94.50, garantía 23.63, descuento 10.50",
      casi(Number(alquiler.montoTotal), 94.5) && casi(Number(alquiler.montoGarantia), 23.63) && casi(Number(alquiler.descuento), 10.5),
      `${alquiler.montoTotal} / ${alquiler.montoGarantia} / ${alquiler.descuento}`
    );
    const reservaPagada = await prisma.reserva.findUnique({ where: { id: r1.reservaId } });
    comprobar("la reserva quedó confirmada en la misma operación", reservaPagada?.confirmadaEn != null);
    const detalleAlquilado = await obtenerDisfrazConEstado(r1.disfrazId);
    comprobar("el disfraz a medida figura como ALQUILADO", detalleAlquilado?.estado === "ALQUILADO", String(detalleAlquilado?.estado));

    e = await capturar(() => prepararCarrito([r1.disfrazId], usuario.id));
    comprobar("una reserva ya pagada no se puede volver a poner en un carrito (409)", esErrorCotizacion(e, 409), descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n4. Pagos que llegan con la reserva perdida");

    // 4.1 La reserva es de otra persona: el pago no puede confirmarla.
    const r3 = registrar(await reservarAMedida(usuario.id, recetas.get("Chef")!, TALLAS));
    e = await capturar(() =>
      crearAlquiler({ ...FECHAS, disfraces: [r3.disfrazId] }, randomUUID(), { reservasIds: [r3.reservaId] })
    );
    comprobar("confirmar una reserva ajena lanza ReservaPerdida", e instanceof ReservaPerdida, descripcion(e));
    comprobar("y no se crea ningún alquiler", (await alquileresDe(r3.disfrazId)) === 0);
    const reservaAjena = await prisma.reserva.findUnique({ where: { id: r3.reservaId } });
    comprobar("y la reserva sigue sin confirmar", reservaAjena?.confirmadaEn === null);
    await liberarSinConfirmar(r3.reservaId);

    // 4.2 Todo o nada: dos reservas en el mismo alquiler y la segunda se perdió.
    const ra = registrar(await reservarAMedida(usuario.id, recetas.get("Policía")!, TALLAS));
    const rb = registrar(await reservarAMedida(usuario.id, recetas.get("Doctor")!, TALLAS));
    // Se simula una reserva ya liberada, pero con su disfraz todavía existente.
    await prisma.reserva.update({ where: { id: rb.reservaId }, data: { liberadaEn: new Date() } });

    e = await capturar(() =>
      crearAlquiler({ ...FECHAS, disfraces: [ra.disfrazId, rb.disfrazId] }, usuario.id, {
        reservasIds: [ra.reservaId, rb.reservaId],
      })
    );
    comprobar("si la segunda reserva se perdió, todo el alquiler falla (ReservaPerdida)", e instanceof ReservaPerdida, descripcion(e));
    const reservaA = await prisma.reserva.findUnique({ where: { id: ra.reservaId } });
    comprobar("la primera reserva NO quedó confirmada a medias (todo o nada)", reservaA?.confirmadaEn === null);
    comprobar("y no existe ningún alquiler con esos disfraces", (await alquileresDe(ra.disfrazId)) + (await alquileresDe(rb.disfrazId)) === 0);
    await liberarSinConfirmar(ra.reservaId);

    // 4.3 La reserva ya se liberó del todo: su disfraz temporal ya no existe.
    const rc = registrar(await reservarAMedida(usuario.id, recetas.get("Policía")!, TALLAS));
    await liberarSinConfirmar(rc.reservaId);
    e = await capturar(() =>
      crearAlquiler({ ...FECHAS, disfraces: [rc.disfrazId] }, usuario.id, { reservasIds: [rc.reservaId] })
    );
    comprobar(
      "con la reserva ya liberada, el alquiler falla con 404 (es la señal que dispara el reembolso)",
      esErrorCotizacion(e, 404),
      descripcion(e)
    );

    // ---------------------------------------------------------------
    console.log("\n5. Un alquiler normal del catálogo no cambia");
    const normal = await crearAlquiler({ ...FECHAS, disfraces: [reyDeGala.id] }, usuario.id, {
      stripeSessionId: `prueba-${randomUUID()}`,
    });
    alquileresCreados.push(normal.id);
    comprobar(
      "Rey de Gala 3 días: alquiler 148.50, garantía 37.13, descuento 16.50",
      casi(Number(normal.montoTotal), 148.5) && casi(Number(normal.montoGarantia), 37.13) && casi(Number(normal.descuento), 16.5),
      `${normal.montoTotal} / ${normal.montoGarantia} / ${normal.descuento}`
    );
  } finally {
    await limpiar(alquileresCreados, reservasLimpiar);
  }

  // ---------------------------------------------------------------
  console.log("\n6. Todo quedó como estaba");
  comprobar("todas las piezas vuelven a su lugar exacto", (await huella()) === inicial);
  const alquileresDespues = await prisma.alquiler.count();
  const reservasRestantes = await prisma.reserva.count();
  const aMedidaRestantes = await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } });
  comprobar(
    "no queda ningún alquiler, reserva ni disfraz a medida de la prueba",
    alquileresDespues === alquileresAntes && reservasRestantes === 0 && aMedidaRestantes === 0,
    `alquileres ${alquileresAntes}→${alquileresDespues}, reservas=${reservasRestantes}, a medida=${aMedidaRestantes}`
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