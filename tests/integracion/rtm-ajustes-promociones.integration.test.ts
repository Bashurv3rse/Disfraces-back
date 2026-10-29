import { leerJson, type MensajeHTTP, type DisfrazHTTP, type ReservaHTTP, type PropuestaHTTP, type CotizacionHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

const checkout = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: checkout } };
} }));

describe("RTM — ajustes de talla y promociones", () => {
  const prefijo = `rtmaju-${randomUUID()}`;
  const ahora = new Date("2030-06-19T12:00:00Z");
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ahora);
    const datos = { nombre: "Usuario RTM ajustes", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
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
    const usuarios = { email: { startsWith: prefijo } };
    const alquileres = await prisma.alquiler.findMany({ where: { usuario: usuarios }, select: { id: true } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres.map(a => a.id) } } });
    await prisma.alquiler.deleteMany({ where: { usuario: usuarios } });
    const reservas = await prisma.reserva.findMany({ where: { usuario: usuarios }, select: { id: true } });
    await prisma.movimientoPrenda.deleteMany({ where: { reservaId: { in: reservas.map(r => r.id) } } });
    await prisma.reserva.deleteMany({ where: { usuario: usuarios } });
    await prisma.prenda.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.disfrazFisico.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.promocion.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  }
  afterEach(async () => { await limpiarDatos(); checkout.mockReset(); });
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(u => u.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally { vi.useRealTimers(); await prisma.$disconnect(); }
  });

  function http(ruta: string, method = "GET", body?: unknown, token = cliente.accessToken) {
    return fetch(`${base}${ruta}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function preparar() {
    const clave = `${prefijo}-${randomUUID().slice(0, 6)}`;
    const original = randomUUID(), donante = randomUUID(), almacen = randomUUID();
    await prisma.disfrazFisico.createMany({ data: [
      { id: original, nombre: `${clave}-original`, familia: clave, tipoDisfraz: prefijo, temporadaEvento: "rtm", precioAlquiler: 40 },
      { id: donante, nombre: `${clave}-donante`, familia: clave, tipoDisfraz: prefijo, temporadaEvento: "rtm", precioAlquiler: 40 },
      { id: almacen, nombre: `${clave}-almacen`, origen: "ALMACEN", tipoDisfraz: "Almacén", temporadaEvento: "rtm", precioAlquiler: 0 },
    ] });
    const camisaM = randomUUID(), pantalonM = randomUUID(), camisaL = randomUUID(), pantalonL = randomUUID();
    await prisma.prenda.createMany({ data: [
      { id: camisaM, nombre: `${clave}-camisa`, tipo: "CAMISA", color: `${clave}-rojo`, talla: "M", disfrazHogarId: original, disfrazActualId: original },
      { id: pantalonM, nombre: `${clave}-pantalon`, tipo: "PANTALON", color: `${clave}-negro`, talla: "M", disfrazHogarId: original, disfrazActualId: original },
      { id: camisaL, nombre: `${clave}-camisa`, tipo: "CAMISA", color: `${clave}-rojo`, talla: "L", disfrazHogarId: donante, disfrazActualId: donante },
      { id: pantalonL, nombre: `${clave}-pantalon`, tipo: "PANTALON", color: `${clave}-negro`, talla: "L", disfrazHogarId: almacen, disfrazActualId: almacen },
    ] });
    return { original, donante, almacen, camisaM, pantalonM, camisaL, pantalonL, piezas: [camisaM, pantalonM, camisaL, pantalonL] };
  }
  type Datos = Awaited<ReturnType<typeof preparar>>;
  const prendas = (datos: Datos) => prisma.prenda.findMany({ where: { id: { in: datos.piezas } }, orderBy: { id: "asc" } });
  async function reservar(datos: Datos) {
    const respuesta = await http("/ajuste-talla/reservar", "POST", { disfrazId: datos.original, tallas: { ropa: "L" } });
    expect(respuesta.status).toBe(201);
    return leerJson<ReservaHTTP>(respuesta);
  }

  it("TC-BE-AJU-02: previsualiza los intercambios generales y por pieza sin mover inventario ni reservar", async () => {
    const datos = await preparar();
    const antes = await prendas(datos);
    const respuesta = await http("/ajuste-talla/previsualizar", "POST", { disfrazId: datos.original, tallas: { ropa: "L" } });
    expect(respuesta.status).toBe(200);
    const propuesta = await leerJson<PropuestaHTTP>(respuesta);
    expect(propuesta).toMatchObject({ completo: true, cambios: 2, faltantes: [] });
    expect(propuesta.piezas).toEqual(expect.arrayContaining([
      expect.objectContaining({ prendaId: datos.camisaM, tipo: "CAMISA", tallaOriginal: "M", talla: "L", cambia: true }),
      expect.objectContaining({ prendaId: datos.pantalonM, tipo: "PANTALON", tallaOriginal: "M", talla: "L", cambia: true }),
    ]));
    const individual = await http("/ajuste-talla/previsualizar", "POST", { disfrazId: datos.original, tallas: { ropa: "M", ajustes: { [datos.camisaM]: "L" } } });
    expect(individual.status).toBe(200);
    const parcial = await leerJson<PropuestaHTTP>(individual);
    expect(parcial.cambios).toBe(1);
    expect(parcial.piezas).toContainEqual(expect.objectContaining({ prendaId: datos.pantalonM, talla: "M", cambia: false }));
    expect(await prendas(datos)).toEqual(antes);
    expect(await prisma.reserva.count({ where: { usuarioId: cliente.usuario.id } })).toBe(0);
    expect(await prisma.movimientoPrenda.count({ where: { prendaId: { in: datos.piezas } } })).toBe(0);
  });

  it("TC-BE-AJU-03: los donantes quedan reservados y no pueden alquilarse por Checkout ni por el administrador", async () => {
    const datos = await preparar();
    const reserva = await reservar(datos);
    const respuesta = await http(`/disfraces/${datos.donante}`);
    expect(respuesta.status).toBe(200);
    expect((await leerJson<DisfrazHTTP>(respuesta)).estado).toBe("RESERVADO");
    const entrada = { disfraces: [datos.donante], fechaInicio: "2030-06-19", fechaFin: "2030-06-20" };
    const checkoutBloqueado = await http("/pagos/crear-sesion", "POST", entrada);
    expect(checkoutBloqueado.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(checkoutBloqueado)).mensaje).toMatch(/reservado/i);
    expect(checkout).not.toHaveBeenCalled();
    const presencial = await http("/alquileres", "POST", entrada, admin.accessToken);
    expect(presencial.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(presencial)).mensaje).toMatch(/reservado/i);
    expect(await prisma.alquilerDisfraz.count({ where: { disfrazFisicoId: datos.donante } })).toBe(0);
    // Al cancelar el ajuste, se restaura el donante y vuelve a poder alquilarse.
    expect((await http(`/a-medida/reservas/${reserva.reservaId}`, "DELETE")).status).toBe(204);
    const permitido = await http("/alquileres", "POST", entrada, admin.accessToken);
    expect(permitido.status).toBe(201);
    expect(await prisma.alquilerDisfraz.count({ where: { disfrazFisicoId: datos.donante } })).toBe(1);
  });

  it("TC-BE-AJU-04: cancelar o vencer un ajuste restaura todas las piezas y la disponibilidad", async () => {
    for (const modo of ["cancelar", "vencer"]) {
      const datos = await preparar();
      const antes = await prendas(datos);
      const reserva = await reservar(datos);
      expect(await prendas(datos)).not.toEqual(antes);
      if (modo === "cancelar") {
        expect((await http(`/a-medida/reservas/${reserva.reservaId}`, "DELETE")).status).toBe(204);
      } else {
        await prisma.reserva.update({ where: { id: reserva.reservaId }, data: { vence: new Date(Date.now() - 1000) } });
        expect((await http("/a-medida/reservas")).status).toBe(200);
      }
      expect(await prendas(datos)).toEqual(antes);
      expect(await prisma.reserva.findUnique({ where: { id: reserva.reservaId } })).toBeNull();
      expect(await prisma.movimientoPrenda.count({ where: { reservaId: reserva.reservaId } })).toBe(0);
      for (const id of [datos.original, datos.donante]) {
        const respuesta = await http(`/disfraces/${id}`);
        expect(respuesta.status).toBe(200);
        expect((await leerJson<DisfrazHTTP>(respuesta)).estado).toBe("DISPONIBLE");
      }
    }
  });

  it("TC-BE-AJU-05: cada intercambio registra ida y vuelta con orden y puede revertirse exactamente", async () => {
    const datos = await preparar();
    const antes = await prendas(datos);
    const reserva = await reservar(datos);
    const registro = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.reservaId }, include: { movimientos: true } });
    expect(registro).toMatchObject({ tipo: "AJUSTE_TALLA", usuarioId: cliente.usuario.id, disfrazFisicoId: datos.original, confirmadaEn: null });
    expect(registro.movimientos).toHaveLength(4);
    expect(registro.movimientos.map(m => m.orden).sort()).toEqual([0, 1, 2, 3]);
    expect(registro.movimientos).toEqual(expect.arrayContaining([
      expect.objectContaining({ prendaId: datos.camisaM, desdeId: datos.original, haciaId: datos.donante }),
      expect.objectContaining({ prendaId: datos.camisaL, desdeId: datos.donante, haciaId: datos.original }),
      expect.objectContaining({ prendaId: datos.pantalonM, desdeId: datos.original, haciaId: datos.almacen }),
      expect.objectContaining({ prendaId: datos.pantalonL, desdeId: datos.almacen, haciaId: datos.original }),
    ]));
    for (const movimiento of registro.movimientos) expect((await prisma.prenda.findUniqueOrThrow({ where: { id: movimiento.prendaId } })).disfrazActualId).toBe(movimiento.haciaId);
    expect((await http(`/a-medida/reservas/${reserva.reservaId}`, "DELETE")).status).toBe(204);
    expect(await prendas(datos)).toEqual(antes);
  });

  async function sinOfertasPrevias(prueba: () => Promise<void>) {
    const activas = await prisma.promocion.findMany({ where: { activa: true }, select: { id: true } });
    const ids = activas.map(p => p.id);
    try {
      await prisma.promocion.updateMany({ where: { id: { in: ids } }, data: { activa: false } });
      await prueba();
    } finally { await prisma.promocion.updateMany({ where: { id: { in: ids } }, data: { activa: true } }); }
  }
  async function promocion(porcentaje: number, extra: { codigo?: string; activa?: boolean; vigenteDesde?: Date; vigenteHasta?: Date } = {}) {
    return prisma.promocion.create({ data: { nombre: `${prefijo}-${randomUUID()}`, descripcion: "Promoción de integración", porcentaje, tipoDisfraz: prefijo, ...extra } });
  }

  it("TC-BE-COT-05: aplica la mejor promoción sin acumular ofertas ni cupones y calcula garantía sobre el neto", async () => {
    await sinOfertasPrevias(async () => {
      const datos = await preparar();
      await promocion(10);
      const mejor = await promocion(20);
      const codigo = `RTM${randomUUID().replace(/-/g, "")}`;
      await promocion(15, { codigo });
      const respuesta = await http("/pagos/cotizar", "POST", { disfraces: [datos.original], fechaInicio: "2030-06-19", fechaFin: "2030-06-22", codigo });
      expect(respuesta.status).toBe(200);
      const resultado = await leerJson<CotizacionHTTP>(respuesta);
      expect(resultado).toMatchObject({ dias: 3, subtotal: 120, descuento: 24, totalAlquiler: 96, garantia: 24, totalAPagar: 120, codigo: { valido: true, aplicado: false } });
      expect(resultado.lineas[0].promocion!.id).toBe(mejor.id);
    });
  });

  it("TC-BE-COT-08: ignora promociones vencidas, inactivas o futuras aunque ofrezcan mayor descuento", async () => {
    await sinOfertasPrevias(async () => {
      const datos = await preparar();
      const vigente = await promocion(10);
      await promocion(80, { vigenteHasta: new Date("2030-06-18T00:00:00Z") });
      await promocion(90, { activa: false });
      await promocion(75, { vigenteDesde: new Date("2030-06-20T00:00:00Z") });
      const respuesta = await http("/pagos/cotizar", "POST", { disfraces: [datos.original], fechaInicio: "2030-06-19", fechaFin: "2030-06-21" });
      expect(respuesta.status).toBe(200);
      const resultado = await leerJson<CotizacionHTTP>(respuesta);
      expect(resultado).toMatchObject({ subtotal: 80, descuento: 8, totalAlquiler: 72, garantia: 18, totalAPagar: 90 });
      expect(resultado.lineas[0].promocion!.id).toBe(vigente.id);
    });
  });
});
