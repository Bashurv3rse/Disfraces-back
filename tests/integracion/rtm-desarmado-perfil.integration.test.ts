import { leerJson, type MensajeHTTP, type PerfilHTTP, type TokenHTTP, type IdHTTP, type DevolucionCreadaHTTP, type ReservaHTTP, type PropuestaHTTP, type EnCursoHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";
import { desarmarReservasTerminadas } from "../../src/modules/a-medida/reservas.base";

const stripe = vi.hoisted(() => ({ crear: vi.fn(), obtener: vi.fn() }));
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: stripe.crear, retrieve: stripe.obtener } };
} }));

// Primera hoja de la RTM, HU-34 a HU-36. Solo se simula el proveedor Stripe.
describe("RTM — desarmado, devolución duplicada y perfil", () => {
  const prefijo = `rtmdes-${randomUUID()}`;
  const ahora = new Date("2030-06-19T12:00:00Z");
  const password = "PruebaRtm#2026";
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;

  function usuario(sufijo: string) {
    return registrarUsuario({ nombre: "Cliente RTM", email: `${prefijo}-${sufijo}@test.local`, password, telefono: "987654321", direccion: "Dirección RTM 123" });
  }
  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ahora);
    cliente = await usuario("cliente");
    admin = await usuario("admin");
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  async function limpiarDatos() {
    const filtroUsuario = { email: { startsWith: prefijo } };
    const alquileres = await prisma.alquiler.findMany({ where: { usuario: filtroUsuario }, select: { id: true } });
    const ids = alquileres.map(a => a.id);
    const devoluciones = await prisma.devolucion.findMany({ where: { alquilerId: { in: ids } }, select: { id: true } });
    await prisma.devolucionPrenda.deleteMany({ where: { devolucionId: { in: devoluciones.map(d => d.id) } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: ids } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: ids } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: ids } } });
    const reservas = await prisma.reserva.findMany({ where: { usuario: filtroUsuario }, select: { id: true } });
    await prisma.movimientoPrenda.deleteMany({ where: { reservaId: { in: reservas.map(r => r.id) } } });
    await prisma.reserva.deleteMany({ where: { usuario: filtroUsuario } });
    await prisma.prenda.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.disfrazFisico.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.recetaPieza.deleteMany({ where: { receta: { nombre: { startsWith: prefijo } } } });
    await prisma.receta.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  }
  afterEach(async () => {
    await limpiarDatos();
    stripe.crear.mockReset();
    stripe.obtener.mockReset();
    vi.setSystemTime(ahora);
  });
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(u => u.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally {
      vi.useRealTimers();
      await prisma.$disconnect();
    }
  });

  function http(ruta: string, method = "GET", body?: unknown, token = cliente.accessToken, cookie?: string) {
    return fetch(`${base}${ruta}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function enCurso() {
    const respuesta = await http("/a-medida/admin/en-curso", "GET", undefined, admin.accessToken);
    expect(respuesta.status).toBe(200);
    return leerJson<EnCursoHTTP>(respuesta);
  }

  async function prepararCiclo(danada = false) {
    const clave = `${prefijo}-${randomUUID().slice(0, 6)}`;
    const almacenId = randomUUID();
    const donanteId = randomUUID();
    const recetaId = randomUUID();
    await prisma.disfrazFisico.createMany({ data: [
      { id: almacenId, nombre: `${clave}-almacen`, origen: "ALMACEN", tipoDisfraz: "Almacén", temporadaEvento: "rtm", precioAlquiler: 0 },
      { id: donanteId, nombre: `${clave}-donante`, origen: "CATALOGO", tipoDisfraz: "Fantasia", temporadaEvento: "rtm", precioAlquiler: 40 },
    ] });
    const camisaId = randomUUID();
    const pantalonId = randomUUID();
    await prisma.prenda.createMany({ data: [
      { id: camisaId, nombre: `${clave}-camisa`, tipo: "CAMISA", talla: "M", color: "Rojo", disfrazHogarId: almacenId, disfrazActualId: almacenId },
      { id: pantalonId, nombre: `${clave}-pantalon`, tipo: "PANTALON", talla: "M", color: "Negro", disfrazHogarId: donanteId, disfrazActualId: donanteId },
    ] });
    await prisma.receta.create({ data: { id: recetaId, nombre: `${clave}-receta`, palabrasClave: [clave], precioDia: 40, piezas: { create: [
      { etiqueta: "Camisa", tipo: "CAMISA", nombreContiene: clave },
      { etiqueta: "Pantalón", tipo: "PANTALON", nombreContiene: clave },
    ] } } });
    const reservada = await http("/a-medida/reservar", "POST", { recetaId, tallas: { ropa: "M" } });
    expect(reservada.status).toBe(201);
    const reserva = await leerJson<ReservaHTTP>(reservada);
    const sessionId = `cs_test_${randomUUID()}`;
    stripe.crear.mockResolvedValue({ id: sessionId, url: "https://checkout.stripe.com/c/pay/cs_test_rtm" });
    expect((await http("/pagos/crear-sesion", "POST", { disfraces: [reserva.disfrazId], fechaInicio: "2030-06-18", fechaFin: "2030-06-19" })).status).toBe(201);
    const parametros = stripe.crear.mock.calls[0][0];
    stripe.obtener.mockResolvedValue({ id: sessionId, payment_status: "paid", amount_total: Number(parametros.metadata.montoTotalCent) + Number(parametros.metadata.garantiaCent), metadata: parametros.metadata });
    const pagado = await http("/pagos/confirmar", "POST", { sessionId });
    expect(pagado.status).toBe(200);
    const alquiler = await leerJson<IdHTTP>(pagado);
    const reporte = { alquilerId: alquiler.id, fechaDevolucion: "2030-06-19", prendas: [
      { prendaId: camisaId, estadoPrenda: danada ? "DANADA" : "BUEN_ESTADO" },
      { prendaId: pantalonId, estadoPrenda: "BUEN_ESTADO" },
    ] };
    const devuelta = await http("/devoluciones", "POST", reporte);
    expect(devuelta.status).toBe(201);
    const { devolucion } = await leerJson<DevolucionCreadaHTTP>(devuelta);
    return { reserva, alquiler, devolucion, reporte, almacenId, donanteId, camisaId, pantalonId, recetaId };
  }
  type Ciclo = Awaited<ReturnType<typeof prepararCiclo>>;
  async function terminarLavado(ciclo: Ciclo) {
    // Viernes 14 → miércoles 19: tres días hábiles completos.
    await prisma.disfrazFisico.update({ where: { id: ciclo.reserva.disfrazId }, data: { fechaSuspension: new Date("2030-06-14T12:00:00Z") } });
    return enCurso();
  }

  it("TC-BE-DES-01: al terminar el lavado las piezas regresan al almacén y al disfraz de origen", async () => {
    const ciclo = await prepararCiclo();
    expect((await enCurso()).find((r: { reservaId: string }) => r.reservaId === ciclo.reserva.reservaId)).toMatchObject({ estado: "EN_LAVADO" });
    expect(await prisma.prenda.count({ where: { disfrazActualId: ciclo.reserva.disfrazId } })).toBe(2);
    expect((await terminarLavado(ciclo)).some((r: { reservaId: string }) => r.reservaId === ciclo.reserva.reservaId)).toBe(false);
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: ciclo.camisaId } })).toMatchObject({ disfrazHogarId: ciclo.almacenId, disfrazActualId: ciclo.almacenId, estado: "DISPONIBLE" });
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: ciclo.pantalonId } })).toMatchObject({ disfrazHogarId: ciclo.donanteId, disfrazActualId: ciclo.donanteId, estado: "DISPONIBLE" });
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: ciclo.reserva.reservaId } })).liberadaEn).not.toBeNull();
  });

  it("TC-BE-DES-02: la pieza dañada vuelve con su estado y sigue excluida del motor de armado", async () => {
    const ciclo = await prepararCiclo(true);
    await terminarLavado(ciclo);
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: ciclo.camisaId } })).toMatchObject({ estado: "DANADA", disfrazActualId: ciclo.almacenId });
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: ciclo.pantalonId } })).toMatchObject({ estado: "DISPONIBLE", disfrazActualId: ciclo.donanteId });
    const propuesta = await http("/a-medida/previsualizar", "POST", { recetaId: ciclo.recetaId, tallas: { ropa: "M" } });
    expect(propuesta.status).toBe(200);
    const resultado = await leerJson<PropuestaHTTP>(propuesta);
    expect(resultado.completo).toBe(false);
    expect(resultado.faltantes).toEqual([expect.objectContaining({ tipo: "CAMISA" })]);
    expect(resultado.piezas.some((p: { tipo: string }) => p.tipo === "CAMISA")).toBe(false);
  });

  it("TC-BE-DES-03: el disfraz desarmado deja de estar en curso y conserva únicamente su historial", async () => {
    const ciclo = await prepararCiclo();
    expect((await enCurso()).some((r: { reservaId: string }) => r.reservaId === ciclo.reserva.reservaId)).toBe(true);
    const despues = await terminarLavado(ciclo);
    expect(despues.some((r: { reservaId: string }) => r.reservaId === ciclo.reserva.reservaId)).toBe(false);
    const catalogo = await http(`/disfraces?nombre=${encodeURIComponent(ciclo.reserva.nombre)}`);
    expect(catalogo.status).toBe(200);
    expect(await catalogo.json()).toEqual([]);
    const temporario = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: ciclo.reserva.disfrazId }, include: { prendasActuales: true } });
    expect(temporario.prendasActuales).toEqual([]);
    expect(temporario.origen).toBe("A_MEDIDA");
    expect(await prisma.alquiler.findUnique({ where: { id: ciclo.alquiler.id } })).not.toBeNull();
    expect(await prisma.movimientoPrenda.count({ where: { reservaId: ciclo.reserva.reservaId } })).toBe(2);
  });

  it("TC-BE-DES-04: repetir el desarmado no cambia piezas, movimientos ni la fecha de liberación", async () => {
    const ciclo = await prepararCiclo();
    await terminarLavado(ciclo);
    const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: ciclo.reserva.reservaId } });
    expect(reserva.liberadaEn).not.toBeNull();
    const movimientos = await prisma.movimientoPrenda.findMany({ where: { reservaId: reserva.id }, orderBy: { orden: "asc" } });
    const prendas = await prisma.prenda.findMany({ where: { id: { in: [ciclo.camisaId, ciclo.pantalonId] } }, orderBy: { id: "asc" } });
    vi.setSystemTime(ahora.getTime() + 1000);
    expect(await desarmarReservasTerminadas()).toBe(0);
    await enCurso();
    expect(await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } })).toEqual(reserva);
    expect(await prisma.movimientoPrenda.findMany({ where: { reservaId: reserva.id }, orderBy: { orden: "asc" } })).toEqual(movimientos);
    expect(await prisma.prenda.findMany({ where: { id: { in: [ciclo.camisaId, ciclo.pantalonId] } }, orderBy: { id: "asc" } })).toEqual(prendas);
  });

  it("TC-BE-DEV-06: repetir una devolución recibe 409 y conserva el reporte y las prendas originales", async () => {
    const ciclo = await prepararCiclo();
    const devolucion = await prisma.devolucion.findUniqueOrThrow({ where: { id: ciclo.devolucion.id }, include: { prendas: true } });
    const prendas = await prisma.prenda.findMany({ where: { id: { in: [ciclo.camisaId, ciclo.pantalonId] } }, orderBy: { id: "asc" } });
    const repetida = await http("/devoluciones", "POST", { ...ciclo.reporte, prendas: ciclo.reporte.prendas.map(p => ({ ...p, estadoPrenda: "DANADA" })) });
    expect(repetida.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(repetida)).mensaje).toMatch(/ya fue devuelto/i);
    expect(await prisma.devolucion.count({ where: { alquilerId: ciclo.alquiler.id } })).toBe(1);
    expect(await prisma.devolucion.findUniqueOrThrow({ where: { id: ciclo.devolucion.id }, include: { prendas: true } })).toEqual(devolucion);
    expect(await prisma.prenda.findMany({ where: { id: { in: [ciclo.camisaId, ciclo.pantalonId] } }, orderBy: { id: "asc" } })).toEqual(prendas);
    expect((await prisma.alquiler.findUniqueOrThrow({ where: { id: ciclo.alquiler.id } })).estado).toBe("FINALIZADO");
  });

  it("TC-BE-PER-02: persiste tallas válidas y rechaza valores inválidos sin actualizar parcialmente el perfil", async () => {
    const ruta = "/auth/perfil/tallas";
    const respuesta = await http(ruta, "PATCH", { tallaRopa: " m ", tallaCalzado: "42" });
    expect(respuesta.status).toBe(200);
    expect((await leerJson<PerfilHTTP>(respuesta)).usuario).toMatchObject({ tallaRopa: "M", tallaCalzado: "42" });
    for (const datos of [{ tallaRopa: "INEXISTENTE" }, { tallaCalzado: "999" }, { tallaRopa: "L", tallaCalzado: "999" }]) {
      expect((await http(ruta, "PATCH", datos)).status).toBe(400);
      expect(await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.usuario.id } })).toMatchObject({ tallaRopa: "M", tallaCalzado: "42" });
    }
    expect((await http(ruta, "PATCH", { tallaRopa: "L" })).status).toBe(200);
    const perfil = await http("/auth/perfil");
    expect(perfil.status).toBe(200);
    expect((await leerJson<PerfilHTTP>(perfil)).usuario).toMatchObject({ tallaRopa: "L", tallaCalzado: "42" });
  });

  it("TC-BE-PER-03: cambiar contraseña exige la actual y una clave robusta y revoca la sesión anterior", async () => {
    const persona = await usuario("password");
    const token = persona.accessToken;
    const nueva = "NuevaClave#2030";
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: persona.usuario.id } });
    for (const datos of [
      { passwordActual: "Incorrecta123!", passwordNueva: nueva },
      { passwordActual: password, passwordNueva: "debil" },
      { passwordActual: password, passwordNueva: password },
    ]) {
      expect((await http("/auth/perfil/password", "PATCH", datos, token)).status).toBe(400);
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: persona.usuario.id } })).password).toBe(antes.password);
    }
    const cambio = await http("/auth/perfil/password", "PATCH", { passwordActual: password, passwordNueva: nueva }, token);
    expect(cambio.status).toBe(200);
    expect(cambio.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    const { accessToken } = await leerJson<TokenHTTP>(cambio);
    const guardada = await prisma.usuario.findUniqueOrThrow({ where: { id: persona.usuario.id } });
    expect(await bcrypt.compare(nueva, guardada.password)).toBe(true);
    expect(await bcrypt.compare(password, guardada.password)).toBe(false);
    expect((await http("/auth/perfil", "GET", undefined, token)).status).toBe(401);
    expect((await http("/auth/refrescar", "POST", {}, token, `refreshToken=${persona.refreshToken}`)).status).toBe(401);
    expect((await http("/auth/perfil", "GET", undefined, accessToken)).status).toBe(200);
    expect((await http("/auth/login", "POST", { email: persona.usuario.email, password })).status).toBe(401);
    expect((await http("/auth/login", "POST", { email: persona.usuario.email, password: nueva })).status).toBe(200);
  });
});
