import { leerJson, type MensajeHTTP, type DevolucionCreadaHTTP, type ReservaHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

const stripe = vi.hoisted(() => ({ crear: vi.fn(), obtener: vi.fn(), listar: vi.fn(), reembolsar: vi.fn() }));
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: stripe.crear, retrieve: stripe.obtener } };
  refunds = { list: stripe.listar, create: stripe.reembolsar };
} }));

// Primera hoja, HU-40 y HU-41. Solo Stripe se simula; HTTP y PostgreSQL son reales.
describe("RTM — reembolsos de garantía y reservas perdidas", () => {
  const prefijo = `rtmree-${randomUUID()}`;
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    const datos = { nombre: "Cliente RTM reembolsos", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    admin = await registrarUsuario({ ...datos, email: `${prefijo}-admin@test.local` });
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
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
    const reservas = await prisma.reserva.findMany({ where: filtro, select: { id: true } });
    await prisma.movimientoPrenda.deleteMany({ where: { reservaId: { in: reservas.map(r => r.id) } } });
    await prisma.reserva.deleteMany({ where: filtro });
    await prisma.prenda.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.disfrazFisico.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.recetaPieza.deleteMany({ where: { receta: { nombre: { startsWith: prefijo } } } });
    await prisma.receta.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  }
  afterEach(async () => {
    vi.restoreAllMocks();
    await limpiarDatos();
    for (const mock of Object.values(stripe)) mock.mockReset();
  });
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

  function http(ruta: string, body?: unknown, token = cliente.accessToken) {
    return fetch(`${base}${ruta}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function prepararGarantia() {
    const id = randomUUID();
    const sessionId = `cs_test_${randomUUID()}`;
    const paymentIntent = `pi_test_${randomUUID()}`;
    const disfraz = await prisma.disfrazFisico.create({ data: { id, nombre: `${prefijo}-${id}`, tipoDisfraz: "Fantasia", temporadaEvento: "rtm", precioAlquiler: 40.33,
      prendasHogar: { create: { nombre: `${prefijo}-camisa`, tipo: "CAMISA", color: "Rojo", talla: "M", disfrazActualId: id } },
    }, include: { prendasHogar: true } });
    const alquiler = await prisma.alquiler.create({ data: { usuarioId: cliente.usuario.id, estado: "ACTIVO", fechaInicio: new Date(), fechaFin: new Date(), montoTotal: 120.99, montoGarantia: 30.25, stripeSessionId: sessionId, disfraces: { create: { disfrazFisicoId: id, precioUnitario: 40.33 } } } });
    const respuesta = await http("/devoluciones", { alquilerId: alquiler.id, fechaDevolucion: new Date().toISOString(), prendas: [{ prendaId: disfraz.prendasHogar[0].id, estadoPrenda: "BUEN_ESTADO" }] });
    expect(respuesta.status).toBe(201);
    const { devolucion } = await leerJson<DevolucionCreadaHTTP>(respuesta);
    stripe.obtener.mockResolvedValue({ id: sessionId, payment_intent: paymentIntent, amount_total: 15124 });
    stripe.listar.mockResolvedValue({ data: [] });
    stripe.reembolsar.mockResolvedValue({ id: `re_test_${devolucion.id}` });
    return { devolucion, alquiler, sessionId, paymentIntent, ruta: `/devoluciones/${devolucion.id}/garantia` };
  }
  const devolverGarantia = (ruta: string) => http(ruta, { accion: "DEVOLVER" }, admin.accessToken);

  it("TC-BE-REE-01: reembolsa solo la garantía sobre el PaymentIntent de la sesión y persiste el comprobante", async () => {
    for (const expandido of [false, true]) {
      const datos = await prepararGarantia();
      stripe.obtener.mockResolvedValue({ id: datos.sessionId, payment_intent: expandido ? { id: datos.paymentIntent } : datos.paymentIntent });
      expect((await devolverGarantia(datos.ruta)).status).toBe(200);
      expect(stripe.obtener).toHaveBeenLastCalledWith(datos.sessionId);
      expect(stripe.reembolsar).toHaveBeenLastCalledWith({ payment_intent: datos.paymentIntent, amount: 3025, reason: "requested_by_customer", metadata: { devolucionId: datos.devolucion.id, alquilerId: datos.alquiler.id, concepto: "garantia" } }, { idempotencyKey: `garantia-${datos.devolucion.id}` });
      const guardada = await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } });
      expect(guardada.garantiaEstado).toBe("DEVUELTA");
      expect(guardada.garantiaMonto!.toNumber()).toBe(30.25);
      expect(guardada.garantiaReembolsoId).toBe(`re_test_${datos.devolucion.id}`);
      expect(guardada.garantiaResueltaPorId).toBe(admin.usuario.id);
    }
  });

  it("TC-BE-REE-02: reutiliza un reembolso existente y no repite operaciones al resolver de nuevo", async () => {
    const datos = await prepararGarantia();
    // Stripe ya procesó este reembolso, pero todavía no quedó registrado localmente.
    stripe.listar.mockResolvedValue({ data: [
      { id: "re_otro", status: "succeeded", metadata: { devolucionId: randomUUID() } },
      { id: "re_fallido", status: "failed", metadata: { devolucionId: datos.devolucion.id } },
      { id: "re_existente", status: "succeeded", metadata: { devolucionId: datos.devolucion.id } },
    ] });
    expect((await devolverGarantia(datos.ruta)).status).toBe(200);
    expect(stripe.listar).toHaveBeenCalledWith({ payment_intent: datos.paymentIntent, limit: 100 });
    expect(stripe.reembolsar).not.toHaveBeenCalled();
    const antes = await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } });
    expect(antes.garantiaReembolsoId).toBe("re_existente");
    expect(antes.garantiaEstado).toBe("DEVUELTA");
    expect((await devolverGarantia(datos.ruta)).status).toBe(409);
    expect(stripe.obtener).toHaveBeenCalledTimes(1);
    expect(stripe.reembolsar).not.toHaveBeenCalled();
    expect(await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } })).toEqual(antes);
  });

  it("TC-BE-REE-04: un fallo de Stripe mantiene la garantía pendiente y permite reintentar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const etapa of ["obtener", "listar", "reembolsar"] as const) {
      for (const mock of Object.values(stripe)) mock.mockReset();
      const datos = await prepararGarantia();
      const antes = await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } });
      stripe[etapa].mockRejectedValueOnce(new Error("Fallo simulado de Stripe"));
      const fallida = await devolverGarantia(datos.ruta);
      expect(fallida.status).toBe(502);
      expect((await leerJson<MensajeHTTP>(fallida)).mensaje).toMatch(/sigue pendiente/i);
      expect(await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } })).toEqual(antes);
      expect((await devolverGarantia(datos.ruta)).status).toBe(200);
      expect((await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } })).garantiaEstado).toBe("DEVUELTA");
      for (const [, opciones] of stripe.reembolsar.mock.calls) expect(opciones.idempotencyKey).toBe(`garantia-${datos.devolucion.id}`);
    }
  });

  async function prepararReservaPerdida() {
    const clave = `${prefijo}-${randomUUID().slice(0, 6)}`;
    const almacenId = randomUUID();
    const recetaId = randomUUID();
    await prisma.disfrazFisico.create({ data: { id: almacenId, nombre: `${clave}-almacen`, origen: "ALMACEN", tipoDisfraz: "Almacén", temporadaEvento: "rtm", precioAlquiler: 0 } });
    const prenda = await prisma.prenda.create({ data: { nombre: `${clave}-camisa`, tipo: "CAMISA", talla: "M", color: "Rojo", disfrazHogarId: almacenId, disfrazActualId: almacenId } });
    await prisma.receta.create({ data: { id: recetaId, nombre: `${clave}-receta`, palabrasClave: [clave], precioDia: 40, piezas: { create: { etiqueta: "Camisa", tipo: "CAMISA", nombreContiene: clave } } } });
    const respuesta = await http("/a-medida/reservar", { recetaId, tallas: { ropa: "M" } });
    expect(respuesta.status).toBe(201);
    const reserva = await leerJson<ReservaHTTP>(respuesta);
    const sessionId = `cs_test_${randomUUID()}`;
    const paymentIntent = `pi_test_${randomUUID()}`;
    stripe.crear.mockResolvedValue({ id: sessionId, url: "https://checkout.stripe.com/c/pay/cs_test_rtm" });
    expect((await http("/pagos/crear-sesion", { disfraces: [reserva.disfrazId], fechaInicio: "2030-06-19", fechaFin: "2030-06-22" })).status).toBe(201);
    const parametros = stripe.crear.mock.calls[stripe.crear.mock.calls.length - 1][0];
    stripe.obtener.mockResolvedValue({ id: sessionId, payment_status: "paid", payment_intent: paymentIntent, amount_total: Number(parametros.metadata.montoTotalCent) + Number(parametros.metadata.garantiaCent), metadata: parametros.metadata });
    stripe.reembolsar.mockResolvedValue({ id: `re_test_${sessionId}` });
    // La reserva vence y el proceso real de limpieza devuelve la pieza antes del pago tardío.
    await prisma.reserva.update({ where: { id: reserva.reservaId }, data: { vence: new Date(Date.now() - 1000) } });
    expect((await http("/a-medida/reservas")).status).toBe(200);
    expect(await prisma.reserva.findUnique({ where: { id: reserva.reservaId } })).toBeNull();
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: prenda.id } })).toMatchObject({ disfrazActualId: almacenId });
    return { reserva, sessionId, paymentIntent, almacenId, prendaId: prenda.id };
  }

  it("TC-BE-REP-01: un pago tardío con la reserva liberada solicita el reembolso completo del PaymentIntent", async () => {
    const datos = await prepararReservaPerdida();
    const confirmacion = await http("/pagos/confirmar", { sessionId: datos.sessionId });
    expect(confirmacion.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(confirmacion)).mensaje).toMatch(/reembolsado completo/i);
    expect(stripe.reembolsar).toHaveBeenCalledTimes(1);
    // Sin amount: se solicita el reembolso completo, no solo la garantía.
    expect(stripe.reembolsar).toHaveBeenCalledWith({ payment_intent: datos.paymentIntent }, { idempotencyKey: `reembolso-reserva-${datos.sessionId}` });
  });

  it("TC-BE-REP-02: una reserva perdida no crea alquiler aunque falle el reembolso externo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const datos = await prepararReservaPerdida();
    stripe.reembolsar.mockRejectedValueOnce(new Error("Reembolso temporalmente indisponible"));
    const respuesta = await http("/pagos/confirmar", { sessionId: datos.sessionId });
    expect(respuesta.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(respuesta)).mensaje).toMatch(/tampoco logramos reembolsar/i);
    expect(await prisma.alquiler.count({ where: { stripeSessionId: datos.sessionId } })).toBe(0);
    expect(await prisma.alquiler.count({ where: { usuarioId: cliente.usuario.id } })).toBe(0);
    expect(await prisma.reserva.findUnique({ where: { id: datos.reserva.reservaId } })).toBeNull();
    expect(await prisma.disfrazFisico.findUnique({ where: { id: datos.reserva.disfrazId } })).toBeNull();
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: datos.prendaId } })).toMatchObject({ disfrazActualId: datos.almacenId, estado: "DISPONIBLE" });
  });

  it("TC-BE-REP-03: reintentar la confirmación usa la misma clave y reconoce un pago ya reembolsado", async () => {
    const datos = await prepararReservaPerdida();
    stripe.reembolsar.mockResolvedValueOnce({ id: "re_test_unico" }).mockRejectedValueOnce({ code: "charge_already_refunded" });
    for (let intento = 0; intento < 2; intento++) {
      const respuesta = await http("/pagos/confirmar", { sessionId: datos.sessionId });
      expect(respuesta.status).toBe(409);
      expect((await leerJson<MensajeHTTP>(respuesta)).mensaje).toMatch(/reembolsado completo/i);
    }
    expect(stripe.reembolsar).toHaveBeenCalledTimes(2);
    for (const [pago, opciones] of stripe.reembolsar.mock.calls) {
      expect(pago).toEqual({ payment_intent: datos.paymentIntent });
      expect(opciones).toEqual({ idempotencyKey: `reembolso-reserva-${datos.sessionId}` });
    }
    expect(await prisma.alquiler.count({ where: { stripeSessionId: datos.sessionId } })).toBe(0);
  });
});
