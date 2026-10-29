import { leerJson, type MensajeHTTP, type ErroresHTTP, type DevolucionCreadaHTTP, type ResumenHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

const reembolsar = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { retrieve: vi.fn() } };
  refunds = { create: reembolsar, list: vi.fn() };
} }));

// Primera hoja de la RTM: HU-39. Los reembolsos externos se cubren en HU-40.
describe("RTM — revisión y decisión de garantías", () => {
  const prefijo = `rtmgar-${randomUUID()}`;
  let server: Server | undefined;
  let base: string;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let otro: Awaited<ReturnType<typeof registrarUsuario>>;
  let proveedor: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    const datos = { nombre: "Usuario RTM garantías", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    admin = await registrarUsuario({ ...datos, email: `${prefijo}-admin@test.local` });
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    otro = await registrarUsuario({ ...datos, email: `${prefijo}-otro@test.local` });
    proveedor = await registrarUsuario({ ...datos, email: `${prefijo}-proveedor@test.local` });
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
    await prisma.usuario.update({ where: { id: proveedor.usuario.id }, data: { rol: "PROVEEDOR" } });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  async function limpiarDatos() {
    const filtro = { usuario: { email: { startsWith: prefijo } } };
    const alquileres = await prisma.alquiler.findMany({ where: filtro, select: { id: true } });
    const ids = alquileres.map(a => a.id);
    const devs = await prisma.devolucion.findMany({ where: { alquilerId: { in: ids } }, select: { id: true } });
    await prisma.devolucionPrenda.deleteMany({ where: { devolucionId: { in: devs.map(d => d.id) } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: ids } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: ids } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: ids } } });
    await prisma.prenda.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.disfrazFisico.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  }
  afterEach(async () => { await limpiarDatos(); reembolsar.mockReset(); });
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(u => u.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally { await prisma.$disconnect(); }
  });

  function http(ruta: string, method = "GET", body?: unknown, token: string | null = admin.accessToken) {
    return fetch(`${base}${ruta}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function prepararDevolucion() {
    const id = randomUUID();
    const disfraz = await prisma.disfrazFisico.create({ data: {
      id, nombre: `${prefijo}-${id}`, tipoDisfraz: "Fantasia", temporadaEvento: "rtm", precioAlquiler: 40,
      prendasHogar: { create: [
        { nombre: `${prefijo}-camisa`, tipo: "CAMISA", color: "Rojo", talla: "M", disfrazActualId: id },
        { nombre: `${prefijo}-pantalon`, tipo: "PANTALON", color: "Negro", talla: "M", disfrazActualId: id },
      ] },
    }, include: { prendasHogar: true } });
    // Alquiler presencial: la decisión se registra en mostrador, sin Stripe.
    const alquiler = await prisma.alquiler.create({ data: { usuarioId: cliente.usuario.id, estado: "ACTIVO", fechaInicio: new Date(), fechaFin: new Date(), montoTotal: 40, montoGarantia: 10, disfraces: { create: { disfrazFisicoId: id, precioUnitario: 40 } } } });
    const respuesta = await http("/devoluciones", "POST", { alquilerId: alquiler.id, fechaDevolucion: new Date().toISOString(), prendas: disfraz.prendasHogar.map(p => ({ prendaId: p.id, estadoPrenda: "BUEN_ESTADO" })) }, cliente.accessToken);
    expect(respuesta.status).toBe(201);
    const { devolucion } = await leerJson<DevolucionCreadaHTTP>(respuesta);
    expect(devolucion.garantiaEstado).toBe("PENDIENTE");
    return { devolucion, disfraz, alquiler, prendaId: disfraz.prendasHogar[0].id };
  }
  const guardada = (id: string) => prisma.devolucion.findUniqueOrThrow({ where: { id }, include: { prendas: true } });

  it("TC-BE-GAR-02: corregir una prenda conserva el reporte original y actualiza estadoAdmin y estado físico", async () => {
    const { devolucion, prendaId } = await prepararDevolucion();
    const ruta = `/devoluciones/${devolucion.id}/prendas/${prendaId}`;
    for (const estado of ["DANADA", "FALTANTE", "BUEN_ESTADO"] as const) {
      const respuesta = await http(ruta, "PATCH", { estado, observacion: "  Inspección de la tienda  " });
      expect(respuesta.status).toBe(200);
      const registro = await guardada(devolucion.id);
      expect(registro.garantiaEstado).toBe("PENDIENTE");
      expect(registro.prendas.find(p => p.prendaId === prendaId)).toMatchObject({ estadoPrenda: "BUEN_ESTADO", estadoAdmin: estado === "BUEN_ESTADO" ? null : estado, observacion: "Inspección de la tienda" });
      expect((await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId } })).estado).toBe(estado === "BUEN_ESTADO" ? "DISPONIBLE" : estado);
    }
    const antes = await guardada(devolucion.id);
    expect((await http(`/devoluciones/${devolucion.id}/prendas/${randomUUID()}`, "PATCH", { estado: "DANADA" })).status).toBe(404);
    expect(await guardada(devolucion.id)).toEqual(antes);
  });

  it("TC-BE-GAR-03: devuelve o retiene la garantía completa y no permite decisiones parciales", async () => {
    for (const accion of ["DEVOLVER", "RETENER"] as const) {
      const { devolucion } = await prepararDevolucion();
      const ruta = `/devoluciones/${devolucion.id}/garantia`;
      expect((await http(ruta, "POST", { accion: "PARCIAL", monto: 1 })).status).toBe(400);
      expect((await guardada(devolucion.id)).garantiaEstado).toBe("PENDIENTE");
      const respuesta = await http(ruta, "POST", { accion, motivo: "Resultado de la revisión de la tienda", monto: 1 });
      expect(respuesta.status).toBe(200);
      const registro = await guardada(devolucion.id);
      expect(registro.garantiaEstado).toBe(accion === "DEVOLVER" ? "DEVUELTA" : "RETENIDA");
      expect(registro.garantiaMonto!.toNumber()).toBe(10);
      expect(registro.garantiaResueltaPorId).toBe(admin.usuario.id);
      expect(registro.garantiaResueltaEn).not.toBeNull();
    }
    expect(reembolsar).not.toHaveBeenCalled();
  });

  it("TC-BE-GAR-04: retener exige un motivo válido y persiste el texto sin espacios exteriores", async () => {
    const { devolucion } = await prepararDevolucion();
    const ruta = `/devoluciones/${devolucion.id}/garantia`;
    const antes = await guardada(devolucion.id);
    for (const motivo of [undefined, "", "   ", "abc"]) {
      const respuesta = await http(ruta, "POST", { accion: "RETENER", motivo });
      expect(respuesta.status).toBe(400);
      expect((await leerJson<ErroresHTTP>(respuesta)).errores.motivo).toBeDefined();
      expect(await guardada(devolucion.id)).toEqual(antes);
    }
    const respuesta = await http(ruta, "POST", { accion: "RETENER", motivo: "  Prenda dañada durante el alquiler  " });
    expect(respuesta.status).toBe(200);
    expect(await guardada(devolucion.id)).toMatchObject({ garantiaEstado: "RETENIDA", garantiaMotivo: "Prenda dañada durante el alquiler" });
  });

  it("TC-BE-GAR-05: una garantía resuelta rechaza nuevas decisiones y correcciones sin modificar registros", async () => {
    for (const primera of ["DEVOLVER", "RETENER"] as const) {
      const { devolucion, prendaId } = await prepararDevolucion();
      const ruta = `/devoluciones/${devolucion.id}/garantia`;
      expect((await http(ruta, "POST", { accion: primera, motivo: "Primera decisión de la tienda" })).status).toBe(200);
      const antes = await guardada(devolucion.id);
      const prenda = await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId } });
      for (const accion of ["DEVOLVER", "RETENER"]) {
        const repetida = await http(ruta, "POST", { accion, motivo: "Intento de una segunda decisión" });
        expect(repetida.status).toBe(409);
        expect((await leerJson<MensajeHTTP>(repetida)).mensaje).toMatch(/ya fue resuelta/i);
      }
      expect((await http(`/devoluciones/${devolucion.id}/prendas/${prendaId}`, "PATCH", { estado: "DANADA" })).status).toBe(409);
      expect(await guardada(devolucion.id)).toEqual(antes);
      expect(await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId } })).toEqual(prenda);
    }
    expect(reembolsar).not.toHaveBeenCalled();
  });

  it("TC-BE-GAR-06: solo un administrador puede resolver o corregir una garantía", async () => {
    const { devolucion, prendaId } = await prepararDevolucion();
    const ruta = `/devoluciones/${devolucion.id}/garantia`;
    const antes = await guardada(devolucion.id);
    for (const token of [cliente.accessToken, otro.accessToken, proveedor.accessToken]) {
      for (const accion of ["DEVOLVER", "RETENER"]) expect((await http(ruta, "POST", { accion, motivo: "Motivo válido para la prueba" }, token)).status).toBe(403);
      expect((await http(`/devoluciones/${devolucion.id}/prendas/${prendaId}`, "PATCH", { estado: "DANADA" }, token)).status).toBe(403);
    }
    expect((await http(ruta, "POST", { accion: "DEVOLVER" }, null)).status).toBe(401);
    expect(await guardada(devolucion.id)).toEqual(antes);
    expect((await http(ruta, "POST", { accion: "RETENER", motivo: "Decisión del administrador" })).status).toBe(200);
    expect((await guardada(devolucion.id)).garantiaEstado).toBe("RETENIDA");
  });

  it("TC-BE-GAR-07: el dashboard cuenta solo garantías pendientes y descuenta las que se resuelven", async () => {
    async function pendientes() {
      const respuesta = await http("/alquileres/admin/resumen");
      expect(respuesta.status).toBe(200);
      return (await leerJson<ResumenHTTP>(respuesta)).devolucionesPendientes;
    }
    const antes = await pendientes();
    const primera = await prepararDevolucion();
    const segunda = await prepararDevolucion();
    expect(await pendientes()).toBe(antes + 2);
    expect((await http(`/devoluciones/${primera.devolucion.id}/garantia`, "POST", { accion: "RETENER", motivo: "Retención tras inspección" })).status).toBe(200);
    expect(await pendientes()).toBe(antes + 1);
    expect((await http(`/devoluciones/${segunda.devolucion.id}/garantia`, "POST", { accion: "DEVOLVER" })).status).toBe(200);
    expect(await pendientes()).toBe(antes);
  });
});
