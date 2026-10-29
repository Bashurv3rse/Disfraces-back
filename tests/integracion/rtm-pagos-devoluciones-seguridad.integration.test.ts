import { leerJson, type MensajeHTTP, type SesionHTTP, type IdHTTP, type DevolucionCreadaHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type Stripe from "stripe";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

// Solo se sustituye el proveedor externo: rutas, JWT, bcrypt y Prisma son reales.
const stripe = vi.hoisted(() => ({ crear: vi.fn(), obtener: vi.fn(), reembolsos: vi.fn(), reembolsar: vi.fn() }));
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: stripe.crear, retrieve: stripe.obtener } };
  refunds = { list: stripe.reembolsos, create: stripe.reembolsar };
} }));

describe("RTM — pagos, devoluciones y seguridad", () => {
  const prefijo = `rtm-bloque4-${randomUUID()}`;
  const password = "PruebaRtm#2026";
  const disfraces: string[] = [];
  const alquileres: string[] = [];
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    cliente = await registrarUsuario(datos(`${prefijo}-cliente@test.local`));
    admin = await registrarUsuario(datos(`${prefijo}-admin@test.local`));
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  function datos(email: string) {
    return { nombre: "Cliente RTM", email, password, telefono: "987654321", direccion: "Dirección RTM 123" };
  }

  async function limpiarDatos() {
    const devs = await prisma.devolucion.findMany({ where: { alquilerId: { in: alquileres } }, select: { id: true } });
    await prisma.devolucionPrenda.deleteMany({ where: { devolucionId: { in: devs.map(d => d.id) } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: alquileres } } });
    await prisma.prenda.deleteMany({ where: { disfrazHogarId: { in: disfraces } } });
    await prisma.disfrazFisico.deleteMany({ where: { id: { in: disfraces } } });
    alquileres.length = 0;
    disfraces.length = 0;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    await limpiarDatos();
  });
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(usuario => usuario.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function http(ruta: string, body?: unknown, token = cliente.accessToken, headers: Record<string, string> = {}) {
    return fetch(`${base}${ruta}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function crearDisfraz(nombre = "disfraz") {
    const id = randomUUID();
    disfraces.push(id);
    return prisma.disfrazFisico.create({ data: {
      id, nombre: `${prefijo}-${nombre}`, tipoDisfraz: prefijo, temporadaEvento: "rtm", precioAlquiler: 40,
      prendasHogar: { create: { nombre: `${prefijo}-camisa`, tipo: "CAMISA", talla: "M", color: "Rojo", disfrazActualId: id } },
    }, include: { prendasHogar: true } });
  }

  it("TC-BE-PAG-06: cotización, líneas de Stripe, monto confirmado y alquiler persistido coinciden", async () => {
    const activas = await prisma.promocion.findMany({ where: { activa: true }, select: { id: true } });
    const promoIds = activas.map(p => p.id);
    try {
      await prisma.promocion.updateMany({ where: { id: { in: promoIds } }, data: { activa: false } });
      const disfraz = await crearDisfraz();
      const entrada = { disfraces: [disfraz.id], fechaInicio: "2030-06-19", fechaFin: "2030-06-22" };
      const respuesta = await http("/pagos/cotizar", entrada);
      expect(respuesta.status).toBe(200);
      expect(await respuesta.json()).toMatchObject({ dias: 3, subtotal: 120, totalAlquiler: 120, garantia: 30, totalAPagar: 150 });
      const sessionId = `cs_test_${randomUUID()}`;
      stripe.crear.mockResolvedValue({ id: sessionId, url: "https://checkout.stripe.com/c/pay/cs_test_rtm" });
      const checkout = await http("/pagos/crear-sesion", entrada);
      expect(checkout.status).toBe(201);
      expect(stripe.crear).toHaveBeenCalledTimes(1);
      const parametros = stripe.crear.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams;
      expect(parametros.line_items).toHaveLength(2);
      expect(parametros.line_items![0].price_data).toMatchObject({ currency: "pen", unit_amount: 12000 });
      expect(parametros.line_items![1].price_data).toMatchObject({ currency: "pen", unit_amount: 3000 });
      expect(parametros.metadata).toMatchObject({ usuarioId: cliente.usuario.id, montoTotalCent: "12000", garantiaCent: "3000" });
      const totalStripe = parametros.line_items!.reduce((total, linea) => total + linea.price_data!.unit_amount! * linea.quantity!, 0);
      expect(totalStripe).toBe(15000);
      stripe.obtener.mockResolvedValue({ id: sessionId, payment_status: "paid", amount_total: 14999, metadata: parametros.metadata });
      expect((await http("/pagos/confirmar", { sessionId })).status).toBe(409);
      expect(await prisma.alquiler.count({ where: { stripeSessionId: sessionId } })).toBe(0);
      stripe.obtener.mockResolvedValue({ id: sessionId, payment_status: "paid", amount_total: totalStripe, metadata: parametros.metadata });
      const confirmacion = await http("/pagos/confirmar", { sessionId });
      expect(confirmacion.status).toBe(200);
      const alquiler = await leerJson<IdHTTP>(confirmacion);
      alquileres.push(alquiler.id);
      const guardado = await prisma.alquiler.findUniqueOrThrow({ where: { stripeSessionId: sessionId }, include: { disfraces: true } });
      expect(guardado.usuarioId).toBe(cliente.usuario.id);
      expect(guardado.montoTotal.toNumber()).toBe(120);
      expect(guardado.montoGarantia.toNumber()).toBe(30);
      expect(guardado.disfraces[0].precioUnitario.toNumber()).toBe(40);
      expect(Math.round((guardado.montoTotal.toNumber() + guardado.montoGarantia.toNumber()) * 100)).toBe(totalStripe);
    } finally {
      await prisma.promocion.updateMany({ where: { id: { in: promoIds } }, data: { activa: true } });
    }
  });

  it("TC-BE-DEV-01: una devolución en buen estado queda pendiente de revisión y permite reembolsar la garantía", async () => {
    const disfraz = await crearDisfraz("devolucion");
    const alquilerId = randomUUID();
    alquileres.push(alquilerId);
    const sessionId = `cs_test_${randomUUID()}`;
    await prisma.alquiler.create({ data: {
      id: alquilerId, usuarioId: cliente.usuario.id, estado: "ACTIVO", montoTotal: 40, montoGarantia: 10,
      fechaInicio: new Date(), fechaFin: new Date(), stripeSessionId: sessionId,
      disfraces: { create: { disfrazFisicoId: disfraz.id, precioUnitario: 40 } },
    } });
    const dev = await http("/devoluciones", { alquilerId, fechaDevolucion: new Date().toISOString(), prendas: [{ prendaId: disfraz.prendasHogar[0].id, estadoPrenda: "BUEN_ESTADO" }] });
    expect(dev.status).toBe(201);
    const { devolucion } = await leerJson<DevolucionCreadaHTTP>(dev);
    expect(devolucion.garantiaEstado).toBe("PENDIENTE");
    expect(stripe.reembolsar).not.toHaveBeenCalled();
    expect((await http(`/devoluciones/${devolucion.id}/garantia`, { accion: "DEVOLVER" })).status).toBe(403);
    stripe.obtener.mockResolvedValue({ payment_intent: "pi_test_garantia_rtm" });
    stripe.reembolsos.mockResolvedValue({ data: [] });
    stripe.reembolsar.mockResolvedValue({ id: "re_test_garantia_rtm" });
    const decision = await http(`/devoluciones/${devolucion.id}/garantia`, { accion: "DEVOLVER" }, admin.accessToken);
    expect(decision.status).toBe(200);
    expect(stripe.reembolsar).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_test_garantia_rtm", amount: 1000 }), { idempotencyKey: `garantia-${devolucion.id}` });
    const guardada = await prisma.devolucion.findUniqueOrThrow({ where: { id: devolucion.id } });
    expect(guardada.garantiaEstado).toBe("DEVUELTA");
    expect(guardada.garantiaMonto!.toNumber()).toBe(10);
    expect(guardada.garantiaReembolsoId).toBe("re_test_garantia_rtm");
  });

  // Regla confirmada por el usuario: HU-39 deja la decisión al administrador.
  // Este criterio sustituye la redacción de HU-20 que prohibía el reembolso por daños.
  it("TC-BE-DEV-02: ante daños o faltantes el administrador puede devolver o retener toda la garantía", async () => {
    for (const estadoPrenda of ["DANADA", "FALTANTE"] as const) {
      for (const accion of ["DEVOLVER", "RETENER"] as const) {
        stripe.reembolsar.mockClear();
        const disfraz = await crearDisfraz(`${estadoPrenda}-${accion}`);
        const alquilerId = randomUUID();
        alquileres.push(alquilerId);
        await prisma.alquiler.create({ data: {
          id: alquilerId, usuarioId: cliente.usuario.id, estado: "ACTIVO", montoTotal: 40, montoGarantia: 10,
          fechaInicio: new Date(), fechaFin: new Date(), stripeSessionId: `cs_test_${randomUUID()}`,
          disfraces: { create: { disfrazFisicoId: disfraz.id, precioUnitario: 40 } },
        } });
        const respuesta = await http("/devoluciones", { alquilerId, fechaDevolucion: new Date().toISOString(), prendas: [{ prendaId: disfraz.prendasHogar[0].id, estadoPrenda }] });
        expect(respuesta.status).toBe(201);
        const { devolucion } = await leerJson<DevolucionCreadaHTTP>(respuesta);
        expect(devolucion.garantiaEstado).toBe("PENDIENTE");
        expect(stripe.reembolsar).not.toHaveBeenCalled();
        const ruta = `/devoluciones/${devolucion.id}/garantia`;
        const motivo = "Decisión del administrador tras inspeccionar la prenda";
        expect((await http(ruta, { accion, motivo })).status).toBe(403);
        stripe.obtener.mockResolvedValue({ payment_intent: "pi_test_decision_admin" });
        stripe.reembolsos.mockResolvedValue({ data: [] });
        stripe.reembolsar.mockResolvedValue({ id: "re_test_decision_admin" });
        const decision = await http(ruta, { accion, motivo }, admin.accessToken);
        expect(decision.status).toBe(200);
        const guardada = await prisma.devolucion.findUniqueOrThrow({ where: { id: devolucion.id }, include: { prendas: true } });
        expect(guardada.garantiaEstado).toBe(accion === "DEVOLVER" ? "DEVUELTA" : "RETENIDA");
        expect(guardada.garantiaMonto!.toNumber()).toBe(10);
        expect(guardada.garantiaMotivo).toBe(motivo);
        expect(guardada.garantiaResueltaPorId).toBe(admin.usuario.id);
        expect(guardada.prendas[0].estadoPrenda).toBe(estadoPrenda);
        expect((await prisma.prenda.findUniqueOrThrow({ where: { id: disfraz.prendasHogar[0].id } })).estado).toBe(estadoPrenda);
        if (accion === "DEVOLVER") {
          expect(stripe.reembolsar).toHaveBeenCalledTimes(1);
          expect(stripe.reembolsar).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000 }), { idempotencyKey: `garantia-${devolucion.id}` });
          expect(guardada.garantiaReembolsoId).toBe("re_test_decision_admin");
        } else {
          expect(stripe.reembolsar).not.toHaveBeenCalled();
          expect(guardada.garantiaReembolsoId).toBeNull();
        }
      }
    }
  });

  it("TC-BE-SEC-01: el backend trata SQL y HTML malicioso como datos sin alterar registros ni autorizar accesos", async () => {
    const disfraz = await crearDisfraz("seguridad");
    const cantidad = await prisma.disfrazFisico.count();
    for (const texto of ["' OR 1=1 --", "'; DROP TABLE \"DisfrazFisico\"; --", '<script>alert("rtm")</script>']) {
      const respuesta = await http(`/disfraces?nombre=${encodeURIComponent(texto)}`);
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers.get("content-type")).toMatch(/application\/json/);
      expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await respuesta.json()).toEqual([]);
    }
    const login = await http("/auth/login", { email: "' OR 1=1 --", password });
    expect(login.status).toBe(400);
    expect(login.headers.get("set-cookie")).toBeNull();
    expect(await prisma.disfrazFisico.count()).toBe(cantidad);
    expect(await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: disfraz.id } })).toMatchObject({ nombre: disfraz.nombre });
  });

  it("TC-BE-SEC-02: limita intentos de login y entrega cabeceras Helmet y CORS del origen permitido", async () => {
    const sesionesAntes = await prisma.sesionActiva.count({ where: { usuarioId: cliente.usuario.id } });
    vi.stubEnv("TEST_LOGIN_RATE_LIMIT", "true");
    for (let intento = 0; intento < 5; intento++) {
      expect((await http("/auth/login", { email: cliente.usuario.email, password: "Incorrecta123!" })).status).toBe(401);
    }
    const bloqueada = await http("/auth/login", { email: cliente.usuario.email, password });
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("retry-after")).toBeTruthy();
    expect((await leerJson<MensajeHTTP>(bloqueada)).mensaje).toMatch(/demasiados intentos/i);
    expect(await prisma.sesionActiva.count({ where: { usuarioId: cliente.usuario.id } })).toBe(sesionesAntes);
    const origen = process.env.CORS_ORIGIN || "http://localhost:5173";
    const permitida = await http("/disfraces?nombre=no-coincide-rtm", undefined, cliente.accessToken, { Origin: origen });
    expect(permitida.status).toBe(200);
    expect(permitida.headers.get("access-control-allow-origin")).toBe(origen);
    expect(permitida.headers.get("access-control-allow-credentials")).toBe("true");
    expect(permitida.headers.get("x-content-type-options")).toBe("nosniff");
    expect(permitida.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(permitida.headers.get("content-security-policy")).toContain("default-src 'self'");
    const ajena = await http("/disfraces?nombre=no-coincide-rtm", undefined, cliente.accessToken, { Origin: "https://origen-ajeno.invalid" });
    expect(ajena.headers.get("access-control-allow-origin")).not.toBe("https://origen-ajeno.invalid");
  });

  it("TC-BE-SEC-03: audita registro y login exitosos y fallidos con identidad, IP y fecha sin contraseñas ni tokens", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = `${prefijo}-auditoria@test.local`;
    const registro = await http("/auth/registro", datos(email));
    expect(registro.status).toBe(201);
    const body = await leerJson<SesionHTTP>(registro);
    expect((await http("/auth/registro", datos(email))).status).toBe(400);
    const login = await http("/auth/login", { email, password });
    expect(login.status).toBe(200);
    const tokens = await leerJson<SesionHTTP>(login);
    expect((await http("/auth/login", { email, password: "Incorrecta123!" })).status).toBe(401);
    const eventos = logs.mock.calls.map(([linea]) => JSON.parse(String(linea))).filter(linea => linea.tipo === "AUDITORIA");
    expect(eventos.map(e => e.evento)).toEqual(["REGISTRO_EXITOSO", "REGISTRO_FALLIDO", "LOGIN_EXITOSO", "LOGIN_FALLIDO"]);
    for (const evento of eventos) {
      expect(evento.email).toBe(email);
      expect(evento.ip).toBe("127.0.0.1");
      expect(Number.isNaN(Date.parse(evento.timestamp))).toBe(false);
      if (evento.evento.endsWith("EXITOSO")) expect(evento.usuarioId).toBe(body.usuario.id);
      const texto = JSON.stringify(evento);
      for (const secreto of [password, "Incorrecta123!", body.accessToken, tokens.accessToken]) expect(texto).not.toContain(secreto);
      expect(evento).not.toHaveProperty("password");
      expect(evento).not.toHaveProperty("refreshToken");
    }
  });
  // Alcance indicado por el usuario: bcrypt; TLS 1.3 queda excluido de este caso.
  it("TC-BE-SEC-04: persiste hashes bcrypt con sal y autentica sin exponer la contraseña", async () => {
    const hashes: string[] = [];
    for (const sufijo of ["bcrypt-uno", "bcrypt-dos"]) {
      const email = `${prefijo}-${sufijo}@test.local`;
      const registro = await http("/auth/registro", datos(email));
      expect(registro.status).toBe(201);
      const respuesta = await leerJson<SesionHTTP>(registro);
      expect(respuesta.usuario).not.toHaveProperty("password");
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email } });
      expect(usuario.password).not.toBe(password);
      expect(usuario.password).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
      expect(await bcrypt.compare(password, usuario.password)).toBe(true);
      expect(await bcrypt.compare("Incorrecta123!", usuario.password)).toBe(false);
      hashes.push(usuario.password);

      const login = await http("/auth/login", { email, password });
      expect(login.status).toBe(200);
      const sesion = await leerJson<SesionHTTP>(login);
      expect(sesion.usuario.id).toBe(usuario.id);
      expect(sesion.accessToken).toBeTruthy();
      expect(sesion.usuario).not.toHaveProperty("password");
      const sesionesAntes = await prisma.sesionActiva.count({ where: { usuarioId: usuario.id } });
      const rechazado = await http("/auth/login", { email, password: "Incorrecta123!" });
      expect(rechazado.status).toBe(401);
      expect(rechazado.headers.get("set-cookie")).toBeNull();
      expect(await rechazado.json()).toEqual({ mensaje: "Credenciales inválidas" });
      expect(await prisma.sesionActiva.count({ where: { usuarioId: usuario.id } })).toBe(sesionesAntes);
    }
    // La misma contraseña debe producir hashes distintos gracias a la sal.
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
