import { leerJson, type MensajeHTTP, type ReservaHTTP, type ReservasHTTP, type BusquedaHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

const checkout = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: checkout } };
} }));

// Primera hoja: HU-28 y HU-30. Prisma, JWT y rutas reales; solo Stripe se simula.
describe("RTM — búsqueda y reservas a medida", () => {
  const prefijo = `rtm-busres-${randomUUID()}`;
  const inicio = new Date();
  const recetas: string[] = [];
  let caso = 0;
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let otro: Awaited<ReturnType<typeof registrarUsuario>>;
  let almacenId: string;
  let recetaId: string;
  let clave: string;
  let piezas: string[] = [];

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(inicio);
    const datos = { nombre: "Cliente RTM reservas", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    otro = await registrarUsuario({ ...datos, email: `${prefijo}-otro@test.local` });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  beforeEach(async () => {
    // Separar las ventanas de los casos evita acumular el rate limit de reservas.
    // Se fija únicamente Date; HTTP, PostgreSQL y temporizadores permanecen reales.
    vi.setSystemTime(inicio.getTime() + caso++ * 61_000);
    checkout.mockReset();
    checkout.mockResolvedValue({ id: "cs_test_reserva_rtm", url: "https://checkout.stripe.com/c/pay/cs_test_reserva_rtm" });
    clave = `rtmreceta${randomUUID().replace(/-/g, "")}`;
    recetaId = randomUUID();
    recetas.push(recetaId);
    await prisma.receta.create({ data: {
      id: recetaId, nombre: `${prefijo}-${caso}`, precioDia: 40, palabrasClave: [clave],
      piezas: { create: [
        { etiqueta: "Camisa", tipo: "CAMISA", colores: ["Rojo"], nombreContiene: clave },
        { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["Negro"], nombreContiene: clave },
      ] },
    } });
    almacenId = randomUUID();
    await prisma.disfrazFisico.create({ data: { id: almacenId, nombre: `${prefijo}-almacen`, origen: "ALMACEN", tipoDisfraz: "Almacén", temporadaEvento: "rtm", precioAlquiler: 1 } });
    piezas = Array.from({ length: 8 }, () => randomUUID());
    await prisma.prenda.createMany({ data: piezas.map((id, indice) => ({
      id, nombre: `${clave}-${indice}`, tipo: indice % 2 === 0 ? "CAMISA" as const : "PANTALON" as const,
      color: indice % 2 === 0 ? "Rojo" : "Negro", talla: "M", disfrazHogarId: almacenId, disfrazActualId: almacenId,
    })) });
  });

  async function limpiarDatos() {
    const propias = await prisma.reserva.findMany({ where: { recetaId: { in: recetas } }, select: { id: true } });
    const ids = propias.map(r => r.id);
    await prisma.movimientoPrenda.deleteMany({ where: { reservaId: { in: ids } } });
    await prisma.reserva.deleteMany({ where: { id: { in: ids } } });
    if (almacenId) await prisma.prenda.deleteMany({ where: { disfrazHogarId: almacenId } });
    await prisma.disfrazFisico.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.peticionDisfraz.deleteMany({ where: { usuario: { email: { startsWith: prefijo } } } });
    await prisma.recetaPieza.deleteMany({ where: { recetaId: { in: recetas } } });
    await prisma.receta.deleteMany({ where: { id: { in: recetas } } });
    recetas.length = 0;
  }

  afterEach(limpiarDatos);
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(usuario => usuario.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally {
      vi.useRealTimers();
      await prisma.$disconnect();
    }
  });

  function http(ruta: string, body?: unknown, token = cliente.accessToken, method = body === undefined ? "GET" : "POST") {
    return fetch(`${base}${ruta}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function reservar(token = cliente.accessToken) {
    const respuesta = await http("/a-medida/reservar", { recetaId, tallas: { ropa: "M" } }, token);
    expect(respuesta.status).toBe(201);
    return leerJson<ReservaHTTP>(respuesta);
  }
  function entradaPago(disfrazId: string) {
    return { disfraces: [disfrazId], fechaInicio: "2030-06-19", fechaFin: "2030-06-20" };
  }

  it("TC-BE-BUS-01: una palabra clave exacta devuelve la receta activa y sus piezas desde PostgreSQL", async () => {
    const inactiva = randomUUID();
    recetas.push(inactiva);
    await prisma.receta.create({ data: { id: inactiva, nombre: `${prefijo}-inactiva`, activa: false, precioDia: 40, palabrasClave: [clave] } });
    const respuesta = await http("/a-medida/buscar", { texto: clave });
    expect(respuesta.status).toBe(200);
    const resultado = await leerJson<BusquedaHTTP>(respuesta);
    expect(resultado.resultado).toBe("EXACTA");
    expect(resultado.recetas).toHaveLength(1);
    expect(resultado.recetas[0]).toMatchObject({ id: recetaId, precioDia: 40, pideTallaRopa: true, pideTallaCalzado: false });
    expect(resultado.recetas[0].piezas).toHaveLength(2);
    expect(resultado.recetas[0].piezas).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: "CAMISA", etiqueta: "Camisa" }),
      expect.objectContaining({ tipo: "PANTALON", etiqueta: "Pantalón" }),
    ]));
    expect(await prisma.peticionDisfraz.findUniqueOrThrow({ where: { id: resultado.peticionId } })).toMatchObject({ usuarioId: cliente.usuario.id, recetaId, texto: clave });
  });

  it("TC-BE-BUS-03: una búsqueda sin coincidencia devuelve SIN_RECETA y registra el pedido del cliente", async () => {
    const texto = `desconocido${randomUUID().replace(/-/g, "")}`;
    const respuesta = await http("/a-medida/buscar", { texto });
    expect(respuesta.status).toBe(200);
    const resultado = await leerJson<BusquedaHTTP>(respuesta);
    expect(resultado.resultado).toBe("SIN_RECETA");
    expect(resultado.mensaje).toMatch(/registramos tu pedido/i);
    expect(await prisma.peticionDisfraz.findUniqueOrThrow({ where: { id: resultado.peticionId } })).toMatchObject({ usuarioId: cliente.usuario.id, texto, recetaId: null, atendida: false });
    expect(await prisma.reserva.count({ where: { usuarioId: cliente.usuario.id } })).toBe(0);
  });

  it("TC-BE-RES-01: reservar mueve las piezas, registra movimientos y concede exactamente 20 minutos", async () => {
    const momento = Date.now();
    const reserva = await reservar();
    expect(reserva.segundosRestantes).toBe(1200);
    expect(new Date(reserva.vence).getTime()).toBe(momento + 20 * 60_000);
    const registro = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.reservaId }, include: { movimientos: true } });
    expect(registro).toMatchObject({ usuarioId: cliente.usuario.id, tipo: "A_MEDIDA", recetaId, disfrazFisicoId: reserva.disfrazId, confirmadaEn: null, liberadaEn: null });
    expect(registro.vence.getTime()).toBe(momento + 20 * 60_000);
    expect(registro.movimientos).toHaveLength(2);
    const movidas = await prisma.prenda.findMany({ where: { disfrazActualId: reserva.disfrazId } });
    expect(movidas).toHaveLength(2);
    expect(movidas.every(p => piezas.includes(p.id) && p.disfrazHogarId === almacenId && p.talla === "M")).toBe(true);
    for (const movimiento of registro.movimientos) expect(movimiento).toMatchObject({ desdeId: almacenId, haciaId: reserva.disfrazId });
    const listado = await http("/a-medida/reservas");
    expect(listado.status).toBe(200);
    expect((await leerJson<ReservasHTTP>(listado))[0]).toMatchObject({ reservaId: reserva.reservaId, segundosRestantes: 1200 });
  });

  it("TC-BE-RES-02: rechaza la cuarta reserva sin pagar sin mover piezas ni crear un disfraz extra", async () => {
    for (let numero = 0; numero < 3; numero++) await reservar();
    const antes = await prisma.prenda.findMany({ where: { id: { in: piezas } }, orderBy: { id: "asc" } });
    expect(antes.filter(p => p.disfrazActualId === almacenId)).toHaveLength(2);
    const respuesta = await http("/a-medida/reservar", { recetaId, tallas: { ropa: "M" } });
    expect(respuesta.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(respuesta)).mensaje).toMatch(/3.*reservados sin pagar/i);
    expect(await prisma.reserva.count({ where: { usuarioId: cliente.usuario.id, confirmadaEn: null, liberadaEn: null } })).toBe(3);
    expect(await prisma.disfrazFisico.count({ where: { origen: "A_MEDIDA", nombre: { startsWith: prefijo } } })).toBe(3);
    expect(await prisma.prenda.findMany({ where: { id: { in: piezas } }, orderBy: { id: "asc" } })).toEqual(antes);
  });

  it("TC-BE-RES-03: iniciar Checkout amplía la reserva a 45 minutos sin confirmar ni crear alquiler", async () => {
    const reserva = await reservar();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    const momento = Date.now();
    const respuesta = await http("/pagos/crear-sesion", entradaPago(reserva.disfrazId));
    expect(respuesta.status).toBe(201);
    expect(checkout).toHaveBeenCalledTimes(1);
    const actual = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.reservaId } });
    expect(actual.vence.getTime()).toBe(momento + 45 * 60_000);
    expect(actual.confirmadaEn).toBeNull();
    const parametros = checkout.mock.calls[0][0];
    expect(JSON.parse(parametros.metadata.reservasIds)).toEqual([reserva.reservaId]);
    expect(parametros.expires_at).toBeLessThan(actual.vence.getTime() / 1000);
    expect(await prisma.alquiler.count({ where: { usuarioId: cliente.usuario.id } })).toBe(0);
  });

  it("TC-BE-RES-04: consultar reservas libera las vencidas y restaura piezas sin afectar una reserva vigente", async () => {
    const vencida = await reservar();
    const vigente = await reservar();
    const movimientos = await prisma.movimientoPrenda.findMany({ where: { reservaId: vencida.reservaId } });
    await prisma.reserva.update({ where: { id: vencida.reservaId }, data: { vence: new Date(Date.now() - 1000) } });
    for (let consulta = 0; consulta < 2; consulta++) {
      const respuesta = await http("/a-medida/reservas");
      expect(respuesta.status).toBe(200);
      expect((await leerJson<ReservasHTTP>(respuesta)).map((r: { reservaId: string }) => r.reservaId)).toEqual([vigente.reservaId]);
    }
    expect(await prisma.reserva.findUnique({ where: { id: vencida.reservaId } })).toBeNull();
    expect(await prisma.disfrazFisico.findUnique({ where: { id: vencida.disfrazId } })).toBeNull();
    expect(await prisma.movimientoPrenda.count({ where: { reservaId: vencida.reservaId } })).toBe(0);
    for (const movimiento of movimientos) expect(await prisma.prenda.findUniqueOrThrow({ where: { id: movimiento.prendaId } })).toMatchObject({ disfrazHogarId: almacenId, disfrazActualId: almacenId, estado: "DISPONIBLE" });
    expect(await prisma.prenda.count({ where: { disfrazActualId: vigente.disfrazId } })).toBe(2);
  });

  it("TC-BE-RES-06: otra persona no puede pagar ni cancelar la reserva y el propietario sí puede hacerlo", async () => {
    const reserva = await reservar();
    const antes = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.reservaId } });
    const pagoAjeno = await http("/pagos/crear-sesion", entradaPago(reserva.disfrazId), otro.accessToken);
    expect(pagoAjeno.status).toBe(409);
    expect(checkout).not.toHaveBeenCalled();
    const cancelacionAjena = await http(`/a-medida/reservas/${reserva.reservaId}`, undefined, otro.accessToken, "DELETE");
    expect(cancelacionAjena.status).toBe(404);
    expect(await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.reservaId } })).toEqual(antes);
    const listaAjena = await http("/a-medida/reservas", undefined, otro.accessToken);
    expect(listaAjena.status).toBe(200);
    expect(await listaAjena.json()).toEqual([]);
    expect(await prisma.prenda.count({ where: { disfrazActualId: reserva.disfrazId } })).toBe(2);
    expect((await http("/pagos/crear-sesion", entradaPago(reserva.disfrazId))).status).toBe(201);
    expect(checkout).toHaveBeenCalledTimes(1);
    expect((await http(`/a-medida/reservas/${reserva.reservaId}`, undefined, cliente.accessToken, "DELETE")).status).toBe(204);
    expect(await prisma.reserva.findUnique({ where: { id: reserva.reservaId } })).toBeNull();
    expect(await prisma.prenda.count({ where: { id: { in: piezas }, disfrazActualId: almacenId } })).toBe(8);
  });
});
