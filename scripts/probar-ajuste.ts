/// <reference types="node" />

import "dotenv/config";
import { createHash, randomUUID } from "crypto";
import { prisma } from "../src/config/prisma";
import { crearAlquiler } from "../src/modules/alquileres/alquileres.service";
import { crearDevolucion } from "../src/modules/devoluciones/devoluciones.service";
import {
  actualizarPrenda,
  estadosDeDisfraces,
  limpiarSuspensionesVencidas,
  obtenerDisfrazConEstado,
} from "../src/modules/disfraces/disfraces.service";
import { desarmarReservasTerminadas, deshacerMovimientos, liberarReservasVencidas } from "../src/modules/a-medida/reservas.base";
import { cancelarReserva } from "../src/modules/a-medida/reservas.service";
import {
  ErrorAjuste,
  elegirIntercambios,
  infoAjuste,
  previsualizarAjuste,
  reservarAjuste,
  validarTallasPrendas,
} from "../src/modules/ajuste-talla/ajuste.service";
import type { DonantePrenda, PrendaDisfraz } from "../src/modules/ajuste-talla/ajuste.service";

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
const esErrorAjuste = (e: unknown, estado: number) => e instanceof ErrorAjuste && e.estado === estado;

// «Huella» de la ubicación de todas las piezas: si dos huellas son iguales, ninguna pieza se movió.
async function huella(): Promise<string> {
  const prendas = await prisma.prenda.findMany({ select: { id: true, disfrazActualId: true }, orderBy: { id: "asc" } });
  return createHash("sha1")
    .update(prendas.map((p) => `${p.id}:${p.disfrazActualId}`).join("|"))
    .digest("hex");
}

const prenda = (id: string, nombre: string, tipo: string, color: string, talla: string): PrendaDisfraz => ({
  id,
  nombre,
  tipo,
  color,
  talla,
});

const donante = (
  id: string,
  nombre: string,
  tipo: string,
  color: string,
  talla: string,
  origen: "ALMACEN" | "DISFRAZ" = "ALMACEN",
  disfrazId = "ALM",
  disfrazNombre = "Almacén",
  familia: string | null = null
): DonantePrenda => ({ id, nombre, tipo, color, talla, origen, disfrazId, disfrazNombre, familia });

function pruebasDeLogica() {
  console.log("\n=== Lógica con datos inventados ===");

  {
    console.log("\n1. Si las tallas ya coinciden, no hay cambios");
    const prendas = [prenda("c", "Camisa", "CAMISA", "negro", "S"), prenda("z", "Botas", "ZAPATO", "negro", "37")];
    const r = elegirIntercambios({
      familia: "Batman",
      prendas,
      tallas: { ropa: "S", calzado: "37" },
      donantes: [donante("d1", "Camisa", "CAMISA", "negro", "M")],
    });
    comprobar("completo, sin intercambios y ninguna pieza marcada como cambiada", r.completo && r.intercambios.length === 0 && r.piezas.every((p) => !p.cambia));
  }

  {
    console.log("\n2. Prefiere el almacén sobre otra instancia de la familia");
    const prendas = [prenda("z", "Zapatillas de baile", "ZAPATO", "blanco", "37")];
    const r = elegirIntercambios({
      familia: "Marinera",
      prendas,
      tallas: { calzado: "40" },
      donantes: [
        donante("fam", "Zapatillas de baile", "ZAPATO", "blanco", "40", "DISFRAZ", "M2", "Marinera #2", "Marinera"),
        donante("alm", "Zapatillas de baile", "ZAPATO", "blanco", "40"),
      ],
    });
    comprobar("elige el repuesto del almacén (no deja reservada a otra instancia)", r.intercambios[0]?.donante.id === "alm");
  }

  {
    console.log("\n3. Usa otra instancia de la familia si el almacén no tiene");
    const prendas = [prenda("z", "Zapatillas de baile", "ZAPATO", "blanco", "37")];
    const r = elegirIntercambios({
      familia: "Marinera",
      prendas,
      tallas: { calzado: "40" },
      donantes: [donante("fam", "Zapatillas de baile", "ZAPATO", "blanco", "40", "DISFRAZ", "M2", "Marinera #2", "Marinera")],
    });
    comprobar("completo con un donante de otro disfraz", r.completo && r.intercambios[0]?.donante.origen === "DISFRAZ");
  }

  {
    console.log("\n4. Último recurso: pieza del almacén del mismo tipo y color");
    const prendas = [prenda("z", "Botas de Batman", "ZAPATO", "negro", "37")];
    const r = elegirIntercambios({
      familia: "Batman",
      prendas,
      tallas: { calzado: "40" },
      donantes: [
        donante("a1", "Botas negras", "ZAPATO", "negro", "40"),
        donante("a2", "Zapatos blancos", "ZAPATO", "blanco", "40"),
      ],
    });
    comprobar("elige la del mismo color y descarta la de otro color", r.completo && r.intercambios[0]?.donante.id === "a1");
  }

  {
    console.log("\n5. Una pieza gemela de la familia va antes que el último recurso");
    const prendas = [prenda("z", "Botas de Batman", "ZAPATO", "negro", "37")];
    const r = elegirIntercambios({
      familia: "Batman",
      prendas,
      tallas: { calzado: "40" },
      donantes: [
        donante("a1", "Botas negras", "ZAPATO", "negro", "40"),
        donante("fam", "Botas de Batman", "ZAPATO", "negro", "40", "DISFRAZ", "B2", "Batman #2", "Batman"),
      ],
    });
    comprobar("prefiere la pieza con el mismo nombre de la familia", r.intercambios[0]?.donante.id === "fam");
  }

  {
    console.log("\n6. Las piezas de talla única no se ajustan");
    const prendas = [prenda("p", "Pañuelo", "PANUELO", "rojo", "única")];
    comprobar("sin tallas no hay errores", validarTallasPrendas(prendas, {}).length === 0);
    const r = elegirIntercambios({ familia: null, prendas, tallas: {}, donantes: [] });
    comprobar("queda completo y sin cambios", r.completo && r.intercambios.length === 0);
  }

  {
    console.log("\n7. Talla que no existe");
    const prendas = [prenda("c", "Camisa", "CAMISA", "negro", "S")];
    const r = elegirIntercambios({
      familia: null,
      prendas,
      tallas: { ropa: "XL" },
      donantes: [donante("d", "Camisa", "CAMISA", "negro", "M")],
    });
    comprobar("no completa y lo explica", !r.completo && (r.faltantes[0]?.motivo.includes("talla XL") ?? false), r.faltantes[0]?.motivo);
    comprobar(
      "ofrece las tallas posibles (la que ya trae y la del donante)",
      JSON.stringify(r.faltantes[0]?.tallasDisponibles) === JSON.stringify(["S", "M"])
    );
  }

  {
    console.log("\n8. Ajuste de talla por pieza");
    const prendas = [prenda("c", "Camisa", "CAMISA", "negro", "S"), prenda("z", "Botas", "ZAPATO", "negro", "37")];
    const r = elegirIntercambios({
      familia: null,
      prendas,
      tallas: { ropa: "S", calzado: "37", ajustes: { z: "40" } },
      donantes: [donante("d", "Botas", "ZAPATO", "negro", "40")],
    });
    comprobar("solo cambia el calzado", r.completo && r.intercambios.length === 1 && r.intercambios[0].original.id === "z");
  }

  {
    console.log("\n9. Una pieza donante nunca se usa dos veces");
    const prendas = [prenda("c1", "Camisa A", "CAMISA", "blanco", "S"), prenda("c2", "Camisa B", "CAMISA", "blanco", "S")];
    const r = elegirIntercambios({
      familia: null,
      prendas,
      tallas: { ropa: "M" },
      donantes: [donante("d", "Camisa blanca", "CAMISA", "blanco", "M")],
    });
    comprobar("cubre una pieza y la otra queda como faltante", r.intercambios.length === 1 && r.faltantes.length === 1 && !r.completo);
  }

  {
    console.log("\n10. Solo almacén (PERMITIR_DONANTES_DE_FAMILIA = false)");
    const prendas = [prenda("z", "Zapatillas", "ZAPATO", "blanco", "37")];
    const soloFamilia = [donante("fam", "Zapatillas", "ZAPATO", "blanco", "40", "DISFRAZ", "M2", "Marinera #2", "Marinera")];
    const sinAlmacen = elegirIntercambios({ familia: "Marinera", prendas, tallas: { calzado: "40" }, donantes: soloFamilia, permitirFamilia: false });
    comprobar("sin pieza en el almacén no toma de otra instancia", !sinAlmacen.completo);
    const conAlmacen = elegirIntercambios({
      familia: "Marinera",
      prendas,
      tallas: { calzado: "40" },
      donantes: [...soloFamilia, donante("alm", "Zapatillas", "ZAPATO", "blanco", "40")],
      permitirFamilia: false,
    });
    comprobar("con pieza en el almacén, completa", conAlmacen.completo && conAlmacen.intercambios[0]?.donante.id === "alm");
  }

  {
    console.log("\n11. Validación de tallas");
    const prendas = [prenda("c", "Camisa", "CAMISA", "negro", "S"), prenda("z", "Botas", "ZAPATO", "negro", "37"), prenda("p", "Pañuelo", "PANUELO", "rojo", "única")];
    comprobar("falta el calzado", validarTallasPrendas(prendas, { ropa: "M" }).some((e) => e.includes("calzado")));
    comprobar("talla de ropa inválida", validarTallasPrendas(prendas, { ropa: "ZZ", calzado: "40" }).some((e) => e.includes("ZZ")));
    comprobar("acepta minúsculas", validarTallasPrendas(prendas, { ropa: "m", calzado: "40" }).length === 0);
    comprobar(
      "ajuste a una pieza que no es del disfraz",
      validarTallasPrendas(prendas, { ropa: "M", calzado: "40", ajustes: { fantasma: "L" } }).some((e) => e.includes("no está en este disfraz"))
    );
    comprobar(
      "ajuste a una pieza de talla única",
      validarTallasPrendas(prendas, { ropa: "M", calzado: "40", ajustes: { p: "M" } }).some((e) => e.includes("talla única"))
    );
  }
}

async function limpiar(alquileres: string[], reservas: string[], disfrazId: string, prendasTocadas: string[]) {
  if (prendasTocadas.length > 0) {
    await prisma.prenda.updateMany({ where: { id: { in: prendasTocadas } }, data: { estado: "DISPONIBLE" } });
  }
  if (alquileres.length > 0) {
    await prisma.devolucionPrenda.deleteMany({ where: { devolucion: { alquilerId: { in: alquileres } } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: alquileres } } });
  }
  for (const id of reservas) {
    try {
      await prisma.$transaction(async (tx) => {
        await deshacerMovimientos(tx, id);
        await tx.reserva.deleteMany({ where: { id } });
      });
    } catch (error) {
      console.warn(`  (aviso) no se pudo limpiar la reserva ${id}:`, (error as Error).message);
    }
  }
  await prisma.disfrazFisico.update({ where: { id: disfrazId }, data: { estadoManual: null, fechaSuspension: null } });
}

async function conBaseDeDatos() {
  console.log("\n=== Con tu base de datos ===");

  const usuario = await prisma.usuario.findFirst({ where: { rol: "CLIENTE" }, select: { id: true, nombre: true } });
  if (!usuario) throw new Error("Hace falta al menos un usuario con rol CLIENTE.");

  await liberarReservasVencidas();
  if ((await prisma.reserva.count()) > 0 || (await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA" } })) > 0) {
    throw new Error("Ya hay reservas o disfraces a medida en la base de datos. Cancélalos o vuelve a correr la seed antes de esta prueba.");
  }

  const disfraz = await prisma.disfrazFisico.findFirst({ where: { nombre: "Batman #1" } });
  if (!disfraz) throw new Error("Falta «Batman #1». Corre la seed: npx prisma db seed");
  const antes = await obtenerDisfrazConEstado(disfraz.id);
  if (antes?.estado !== "DISPONIBLE") {
    throw new Error(`«Batman #1» debe estar DISPONIBLE para esta prueba (hoy: ${antes?.estado}). También conviene que «Batman #2» esté disponible.`);
  }

  const TALLAS = { ropa: "M", calzado: "40" };
  const FECHAS = { fechaInicio: "2026-10-21", fechaFin: "2026-10-24" };
  const inicial = await huella();
  const alquileresAntes = await prisma.alquiler.count();
  const estadoDe = async () => (await obtenerDisfrazConEstado(disfraz.id))?.estado;

  console.log(`Usuario de prueba: ${usuario.nombre}`);

  const alquileres: string[] = [];
  const reservas: string[] = [];
  const prendasTocadas: string[] = [];

  try {
    // ---------------------------------------------------------------
    console.log("\n1. Información y propuesta (sin reservar nada)");
    const info = await infoAjuste(disfraz.id, usuario.id);
    comprobar("el disfraz es ajustable y pide ropa y calzado", info.ajustable && info.pideTallaRopa && info.pideTallaCalzado, info.motivo ?? "");

    const vista = await previsualizarAjuste(disfraz.id, TALLAS, usuario.id);
    comprobar(
      "la propuesta es completa y propone cambios",
      vista.completo && vista.cambios >= 1,
      `completo=${vista.completo}, cambios=${vista.cambios}, ${vista.faltantes.map((f) => f.motivo).join(" | ")}`
    );
    comprobar("la vista no revela de qué disfraz sale cada pieza", !/donante|disfrazOrigen|disfrazNombre|familia/i.test(JSON.stringify(vista)));
    comprobar("previsualizar no mueve ninguna pieza", (await huella()) === inicial);

    // ---------------------------------------------------------------
    console.log("\n2. Reservar el ajuste");
    const { reserva } = await reservarAjuste(disfraz.id, TALLAS, usuario.id);
    reservas.push(reserva.reservaId);

    const movimientos = await prisma.movimientoPrenda.findMany({ where: { reservaId: reserva.reservaId } });
    comprobar("anota 2 movimientos por cada pieza cambiada", movimientos.length === reserva.cambios * 2, `movimientos=${movimientos.length}, cambios=${reserva.cambios}`);

    const hogar = await prisma.prenda.count({ where: { disfrazHogarId: disfraz.id } });
    const dentro = await prisma.prenda.findMany({ where: { disfrazActualId: disfraz.id }, select: { id: true, tipo: true, talla: true } });
    comprobar("el disfraz conserva el mismo número de piezas (intercambio, no préstamo)", dentro.length === hogar, `${dentro.length} de ${hogar}`);
    comprobar(
      "las piezas quedan en las tallas elegidas",
      dentro.every((p) => (p.tipo === "ZAPATO" ? p.talla === "40" : ["ACCESORIO", "PANUELO"].includes(p.tipo) || p.talla === "M")),
      dentro.map((p) => `${p.tipo}:${p.talla}`).join(", ")
    );

    const fila = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.reservaId } });
    const minutos = (fila.vence.getTime() - Date.now()) / 60_000;
    comprobar("es una reserva de ajuste con plazo de unos 20 minutos", fila.tipo === "AJUSTE_TALLA" && Math.abs(minutos - 20) < 1, `${fila.tipo}, ${minutos.toFixed(1)} min`);
    comprobar("el disfraz figura como RESERVADO", (await estadoDe()) === "RESERVADO", String(await estadoDe()));

    const donantesIds = Array.from(new Set(movimientos.flatMap((m) => [m.desdeId, m.haciaId]).filter((id) => id !== disfraz.id)));
    const donantes = await estadosDeDisfraces(donantesIds);
    console.log(`  (donantes del catálogo: ${donantes.map((d) => d.nombre).join(", ") || "ninguno, todo salió del almacén"})`);
    comprobar("los disfraces donantes del catálogo quedan RESERVADO", donantes.every((d) => d.estado === "RESERVADO"), donantes.map((d) => `${d.nombre}:${d.estado}`).join(", "));

    // ---------------------------------------------------------------
    console.log("\n3. Mientras está reservado");
    let e = await capturar(() => previsualizarAjuste(disfraz.id, TALLAS, randomUUID()));
    comprobar("otra persona no puede ajustarlo (409)", esErrorAjuste(e, 409), descripcion(e));

    e = await capturar(() => reservarAjuste(disfraz.id, TALLAS, usuario.id));
    comprobar("la misma persona no puede reservarlo dos veces (409)", esErrorAjuste(e, 409) && descripcion(e).includes("Ya tienes"), descripcion(e));

    const entrada = movimientos.find((m) => m.haciaId === disfraz.id);
    if (!entrada) throw new Error("La reserva no metió ninguna pieza en el disfraz.");
    e = await capturar(() => actualizarPrenda(entrada.prendaId, { estado: "DANADA" }));
    comprobar("una pieza apartada no se puede cambiar a mano", e instanceof Error && descripcion(e).includes("apartada"), descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n4. Cancelar el ajuste");
    await cancelarReserva(reserva.reservaId, usuario.id);
    comprobar("todas las piezas vuelven a su lugar exacto", (await huella()) === inicial);
    comprobar(
      "la reserva desaparece pero el disfraz del catálogo sigue",
      (await prisma.reserva.count({ where: { id: reserva.reservaId } })) === 0 && (await prisma.disfrazFisico.count({ where: { id: disfraz.id } })) === 1
    );
    comprobar("vuelve a estar DISPONIBLE", (await estadoDe()) === "DISPONIBLE", String(await estadoDe()));

    // ---------------------------------------------------------------
    console.log("\n5. Tallas que el disfraz ya tiene");
    e = await capturar(() => reservarAjuste(disfraz.id, { ropa: "S", calzado: "37" }, usuario.id));
    comprobar("se rechaza con un mensaje claro (409)", esErrorAjuste(e, 409) && descripcion(e).includes("ya viene"), descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n6. Dos reservas simultáneas del mismo disfraz");
    const resultados = await Promise.allSettled([
      reservarAjuste(disfraz.id, TALLAS, usuario.id),
      reservarAjuste(disfraz.id, TALLAS, usuario.id),
    ]);
    const logradas = resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const rechazos = resultados.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    for (const l of logradas) reservas.push(l.reserva.reservaId);

    comprobar("se logra exactamente una", logradas.length === 1 && rechazos.length === 1, `logradas=${logradas.length}, rechazos=${rechazos.length}`);
    comprobar("el rechazo es un error controlado (409)", rechazos.every((r) => esErrorAjuste(r, 409)), rechazos.map(descripcion).join(" | "));
    comprobar("el disfraz sigue con el mismo número de piezas", (await prisma.prenda.count({ where: { disfrazActualId: disfraz.id } })) === hogar);

    for (const l of logradas) await cancelarReserva(l.reserva.reservaId, usuario.id);
    comprobar("al cancelar, todo vuelve a su lugar exacto", (await huella()) === inicial);

    // ---------------------------------------------------------------
    console.log("\n7. Pago, devolución con una pieza dañada y desarmado");
    const r2 = await reservarAjuste(disfraz.id, TALLAS, usuario.id);
    reservas.push(r2.reserva.reservaId);
    const movs2 = await prisma.movimientoPrenda.findMany({ where: { reservaId: r2.reserva.reservaId } });
    const ids2 = Array.from(new Set(movs2.flatMap((m) => [m.desdeId, m.haciaId]).filter((id) => id !== disfraz.id)));

    const alquiler = await crearAlquiler({ ...FECHAS, disfraces: [disfraz.id] }, usuario.id, { reservasIds: [r2.reserva.reservaId] });
    alquileres.push(alquiler.id);

    const confirmada = await prisma.reserva.findUniqueOrThrow({ where: { id: r2.reserva.reservaId } });
    comprobar("el pago confirma la reserva y el disfraz figura como ALQUILADO", confirmada.confirmadaEn !== null && (await estadoDe()) === "ALQUILADO", String(await estadoDe()));

    const donantesPagado = await estadosDeDisfraces(ids2);
    comprobar("los donantes siguen RESERVADO tras el pago", donantesPagado.every((d) => d.estado === "RESERVADO"), donantesPagado.map((d) => `${d.nombre}:${d.estado}`).join(", "));

    const desarmadasAlquilado = await desarmarReservasTerminadas();
    const llegadas = await prisma.prenda.count({ where: { disfrazActualId: disfraz.id, NOT: { disfrazHogarId: disfraz.id } } });
    comprobar("mientras está alquilado NO se desarma", desarmadasAlquilado === 0 && llegadas > 0, `desarmadas=${desarmadasAlquilado}, piezas ajenas dentro=${llegadas}`);

    const enDisfraz = await prisma.prenda.findMany({ where: { disfrazActualId: disfraz.id }, select: { id: true, disfrazHogarId: true } });
    const llegada = enDisfraz.find((p) => p.disfrazHogarId !== disfraz.id);
    if (!llegada) throw new Error("No hay ninguna pieza que haya llegado por el ajuste.");
    prendasTocadas.push(llegada.id);

    const dev = await crearDevolucion(
      {
        alquilerId: alquiler.id,
        fechaDevolucion: new Date().toISOString(),
        prendas: enDisfraz.map((p) => ({
          prendaId: p.id,
          estadoPrenda: p.id === llegada.id ? ("DANADA" as const) : ("BUEN_ESTADO" as const),
        })),
      },
      usuario.id
    );
    comprobar("no se busca reemplazo para la pieza dañada que llegó por el ajuste", dev.sustituciones.length === 0, JSON.stringify(dev.sustituciones));

    const lavado = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: disfraz.id } });
    comprobar("el disfraz entra en lavado", lavado.estadoManual === "SUSPENDIDO" && lavado.fechaSuspension !== null);
    comprobar("durante el lavado no se desarma", (await desarmarReservasTerminadas()) === 0);

    // Se simula que pasaron 10 días.
    await prisma.disfrazFisico.update({ where: { id: disfraz.id }, data: { fechaSuspension: new Date(Date.now() - 10 * 86_400_000) } });
    await limpiarSuspensionesVencidas();

    comprobar("al terminar el lavado todas las piezas vuelven a su lugar exacto", (await huella()) === inicial);

    const danada = await prisma.prenda.findUniqueOrThrow({ where: { id: llegada.id } });
    comprobar(
      "la pieza dañada volvió a su origen CON su estado",
      danada.estado === "DANADA" && danada.disfrazActualId === danada.disfrazHogarId,
      `estado=${danada.estado}`
    );

    const propias = await prisma.prenda.findMany({ where: { disfrazHogarId: disfraz.id }, select: { disfrazActualId: true } });
    comprobar("el disfraz recuperó todas sus piezas originales", propias.every((p) => p.disfrazActualId === disfraz.id));

    const final = await prisma.reserva.findUniqueOrThrow({ where: { id: r2.reserva.reservaId } });
    const movFinal = await prisma.movimientoPrenda.count({ where: { reservaId: final.id } });
    comprobar("la reserva queda como historial (liberada y con sus movimientos)", final.liberadaEn !== null && movFinal === r2.reserva.cambios * 2, `movimientos=${movFinal}`);

    const liberados = await estadosDeDisfraces(ids2);
    comprobar("los donantes ya no figuran RESERVADO", liberados.every((d) => d.estado !== "RESERVADO"), liberados.map((d) => `${d.nombre}:${d.estado}`).join(", "));
    console.log("  (un donante puede quedar INCOMPLETO: la pieza dañada vuelve a su origen con su estado, como se espera)");
  } finally {
    await limpiar(alquileres, reservas, disfraz.id, prendasTocadas);
  }

  // ---------------------------------------------------------------
  console.log("\n8. Todo quedó como estaba");
  comprobar("todas las piezas en su lugar", (await huella()) === inicial);
  const reservasRestantes = await prisma.reserva.count();
  const alquileresDespues = await prisma.alquiler.count();
  comprobar(
    "no queda ninguna reserva ni alquiler de la prueba",
    reservasRestantes === 0 && alquileresDespues === alquileresAntes,
    `reservas=${reservasRestantes}, alquileres ${alquileresAntes}→${alquileresDespues}`
  );
  comprobar("«Batman #1» vuelve a estar DISPONIBLE", (await estadoDe()) === "DISPONIBLE", String(await estadoDe()));
}

pruebasDeLogica();
conBaseDeDatos()
  .then(() => {
    console.log(`\nResultado: ${pasaron} pasaron, ${fallaron} fallaron.`);
    process.exitCode = fallaron > 0 ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());