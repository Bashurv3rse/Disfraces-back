/// <reference types="node" />

import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { crearAlquiler, resumenAdmin } from "../src/modules/alquileres/alquileres.service";
import { crearDevolucion } from "../src/modules/devoluciones/devoluciones.service";
import { resolverGarantiaSchema } from "../src/modules/devoluciones/devoluciones.schema";
import { ErrorGarantia, corregirEstadoPrenda, resolverGarantia } from "../src/modules/devoluciones/garantia.service";
import { estadosDeDisfraces } from "../src/modules/disfraces/disfraces.service";

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
const esError = (e: unknown, estado: number) => e instanceof ErrorGarantia && e.estado === estado;

async function main() {
  const cliente = await prisma.usuario.findFirst({ where: { rol: "CLIENTE" }, select: { id: true, nombre: true } });
  const admin = await prisma.usuario.findFirst({ where: { rol: "ADMINISTRADOR" }, select: { id: true, nombre: true } });
  if (!cliente || !admin) throw new Error("Hace falta al menos un usuario CLIENTE y uno ADMINISTRADOR.");

  const libre = (await estadosDeDisfraces()).find((d) => d.estado === "DISPONIBLE");
  if (!libre) throw new Error("No hay ningún disfraz del catálogo DISPONIBLE para la prueba.");
  const disfrazId = libre.id;

  const FECHAS = { fechaInicio: "2026-10-21", fechaFin: "2026-10-24" };
  const alquileres: string[] = [];
  const prendasTocadas: string[] = [];
  const pendientesAntes = await prisma.devolucion.count({ where: { garantiaEstado: "PENDIENTE" } });

  console.log(`Cliente: ${cliente.nombre} · Admin: ${admin.nombre} · Disfraz: ${libre.nombre}`);

  async function alquilarYDevolver() {
    const alquiler = await crearAlquiler({ ...FECHAS, disfraces: [disfrazId] }, cliente!.id);
    alquileres.push(alquiler.id);
    const piezas = await prisma.prenda.findMany({ where: { disfrazActualId: disfrazId }, select: { id: true } });
    prendasTocadas.push(...piezas.map((p) => p.id));
    const { devolucion } = await crearDevolucion(
      {
        alquilerId: alquiler.id,
        fechaDevolucion: new Date().toISOString(),
        prendas: piezas.map((p) => ({ prendaId: p.id, estadoPrenda: "BUEN_ESTADO" as const })),
      },
      cliente!.id
    );
    return { alquiler, piezas, devolucion };
  }

  try {
    // ---------------------------------------------------------------
    console.log("\n1. Una devolución nueva deja la garantía pendiente");
    const a = await alquilarYDevolver();
    comprobar("garantía PENDIENTE y sin monto resuelto", a.devolucion.garantiaEstado === "PENDIENTE" && a.devolucion.garantiaMonto === null);
    const resumen = await resumenAdmin();
    comprobar(
      "el Dashboard cuenta las garantías por resolver",
      resumen.devolucionesPendientes === (await prisma.devolucion.count({ where: { garantiaEstado: "PENDIENTE" } })),
      String(resumen.devolucionesPendientes)
    );

    // ---------------------------------------------------------------
    console.log("\n2. El admin corrige el estado de una prenda");
    const pieza = a.piezas[0];
    let dev = await corregirEstadoPrenda(a.devolucion.id, pieza.id, "DANADA", "Mancha en la manga");
    let fila = dev?.prendas.find((p) => p.prendaId === pieza.id);
    let fisica = await prisma.prenda.findUniqueOrThrow({ where: { id: pieza.id } });
    comprobar(
      "se guarda la corrección sin borrar lo que reportó el cliente",
      fila?.estadoPrenda === "BUEN_ESTADO" && fila.estadoAdmin === "DANADA" && fila.observacion === "Mancha en la manga",
      `${fila?.estadoPrenda} → ${fila?.estadoAdmin}`
    );
    comprobar("la prenda física pasa a DANADA", fisica.estado === "DANADA", fisica.estado);

    dev = await corregirEstadoPrenda(a.devolucion.id, pieza.id, "BUEN_ESTADO");
    fila = dev?.prendas.find((p) => p.prendaId === pieza.id);
    fisica = await prisma.prenda.findUniqueOrThrow({ where: { id: pieza.id } });
    comprobar("al volver a lo que reportó el cliente, la corrección se borra", fila?.estadoAdmin === null);
    comprobar("y la prenda física vuelve a DISPONIBLE", fisica.estado === "DISPONIBLE", fisica.estado);

    const ajena = await prisma.prenda.findFirstOrThrow({ where: { disfrazHogarId: { not: disfrazId } }, select: { id: true } });
    let e = await capturar(() => corregirEstadoPrenda(a.devolucion.id, ajena.id, "DANADA"));
    comprobar("una prenda que no es de esta devolución se rechaza (404)", esError(e, 404), descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n3. Validación de la decisión");
    comprobar("retener sin motivo se rechaza", !resolverGarantiaSchema.safeParse({ accion: "RETENER" }).success);
    comprobar("retener con un motivo corto se rechaza", !resolverGarantiaSchema.safeParse({ accion: "RETENER", motivo: "no" }).success);
    comprobar("retener con motivo es válido", resolverGarantiaSchema.safeParse({ accion: "RETENER", motivo: "Entregó tarde" }).success);
    comprobar("devolver no necesita motivo", resolverGarantiaSchema.safeParse({ accion: "DEVOLVER" }).success);

    // ---------------------------------------------------------------
    console.log("\n4. Devolver la garantía (alquiler directo: se cierra en mostrador, sin Stripe)");
    const devuelta = await resolverGarantia(a.devolucion.id, "DEVOLVER", undefined, admin.id);
    comprobar(
      "queda DEVUELTA con el monto completo de la garantía",
      devuelta?.garantiaEstado === "DEVUELTA" && Number(devuelta.garantiaMonto) === Number(a.alquiler.montoGarantia),
      `${devuelta?.garantiaEstado} · ${devuelta?.garantiaMonto}`
    );
    comprobar("sin pago en Stripe no hay ID de reembolso", devuelta?.garantiaReembolsoId === null);
    comprobar("queda registrado quién y cuándo", devuelta?.garantiaResueltaPorId === admin.id && devuelta.garantiaResueltaEn !== null);

    e = await capturar(() => resolverGarantia(a.devolucion.id, "RETENER", "Intento tardío", admin.id));
    comprobar("una garantía resuelta no se puede resolver otra vez (409)", esError(e, 409), descripcion(e));
    e = await capturar(() => corregirEstadoPrenda(a.devolucion.id, pieza.id, "DANADA"));
    comprobar("tampoco se pueden corregir sus prendas (409)", esError(e, 409), descripcion(e));

    // ---------------------------------------------------------------
    console.log("\n5. Retener la garantía");
    await prisma.disfrazFisico.update({ where: { id: disfrazId }, data: { estadoManual: null, fechaSuspension: null } });
    const b = await alquilarYDevolver();
    const retenida = await resolverGarantia(b.devolucion.id, "RETENER", "Entregó el disfraz con una mancha", admin.id);
    comprobar(
      "queda RETENIDA con su motivo y el monto completo",
      retenida?.garantiaEstado === "RETENIDA" &&
        retenida.garantiaMotivo === "Entregó el disfraz con una mancha" &&
        Number(retenida.garantiaMonto) === Number(b.alquiler.montoGarantia),
      `${retenida?.garantiaEstado}`
    );
    comprobar("retener no genera ningún reembolso", retenida?.garantiaReembolsoId === null);

    // ---------------------------------------------------------------
    console.log("\n6. Lo que ve el cliente");
    const propios = await prisma.alquiler.findMany({
      where: { id: { in: alquileres } },
      select: { id: true, devolucion: { select: { garantiaEstado: true, garantiaMotivo: true } } },
    });
    const estados = propios.map((p) => p.devolucion?.garantiaEstado).sort();
    comprobar("ambos alquileres muestran su garantía resuelta", estados.join(",") === "DEVUELTA,RETENIDA", estados.join(","));
  } finally {
    if (prendasTocadas.length > 0) {
      await prisma.prenda.updateMany({ where: { id: { in: prendasTocadas } }, data: { estado: "DISPONIBLE" } });
    }
    if (alquileres.length > 0) {
      await prisma.devolucionPrenda.deleteMany({ where: { devolucion: { alquilerId: { in: alquileres } } } });
      await prisma.devolucion.deleteMany({ where: { alquilerId: { in: alquileres } } });
      await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres } } });
      await prisma.alquiler.deleteMany({ where: { id: { in: alquileres } } });
    }
    await prisma.disfrazFisico.update({ where: { id: disfrazId }, data: { estadoManual: null, fechaSuspension: null } });
  }

  // ---------------------------------------------------------------
  console.log("\n7. Todo quedó como estaba");
  const pendientesDespues = await prisma.devolucion.count({ where: { garantiaEstado: "PENDIENTE" } });
  comprobar("no quedan devoluciones ni alquileres de la prueba", pendientesDespues === pendientesAntes && (await prisma.alquiler.count({ where: { id: { in: alquileres } } })) === 0);
  console.log("\n(El reembolso real contra Stripe se prueba pagando un alquiler y resolviendo la garantía desde la pantalla del admin.)");
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