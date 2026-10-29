import { leerJson, type MensajeHTTP, type DisfrazHTTP, type DevolucionCreadaHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

// Primera hoja de la RTM: pendientes de HU-13 a HU-17, en orden.
describe("RTM — inventario, sustituciones y lavado", () => {
  const prefijo = `rtm-bloque3-${randomUUID()}`;
  const ahora = new Date("2030-06-19T12:00:00Z");
  const disfraces: string[] = [];
  const alquileres: string[] = [];
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    // El setup valida también DATABASE_URL y NODE_ENV antes de importar la suite.
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ahora);
    const datos = { nombre: "Cliente RTM inventario", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
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
    const devoluciones = await prisma.devolucion.findMany({ where: { alquilerId: { in: alquileres } }, select: { id: true } });
    await prisma.devolucionPrenda.deleteMany({ where: { devolucionId: { in: devoluciones.map(d => d.id) } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: alquileres } } });
    await prisma.sustitucion.deleteMany({ where: { OR: [{ disfrazOrigenId: { in: disfraces } }, { disfrazDestinoId: { in: disfraces } }] } });
    await prisma.prenda.deleteMany({ where: { disfrazHogarId: { in: disfraces } } });
    await prisma.disfrazFisico.deleteMany({ where: { id: { in: disfraces } } });
    alquileres.length = 0;
    disfraces.length = 0;
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

  function http(ruta: string, method = "GET", body?: unknown, token = admin.accessToken) {
    return fetch(`${base}${ruta}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function crearDisfraz(nombre: string, grupo = prefijo, tipo = "Fantasia") {
    const id = randomUUID();
    disfraces.push(id);
    return prisma.disfrazFisico.create({ data: {
      id, nombre: `${prefijo}-${nombre}`, familia: `${prefijo}-${nombre}`, grupoCompatibilidad: grupo,
      tipoDisfraz: tipo, temporadaEvento: "rtm", precioAlquiler: 40,
      prendasHogar: { create: { nombre: `${prefijo}-camisa`, tipo: "CAMISA", talla: "M", color: "Rojo", disfrazActualId: id } },
    }, include: { prendasHogar: true } });
  }
  type DisfrazPrueba = Awaited<ReturnType<typeof crearDisfraz>>;
  const prendaId = (disfraz: DisfrazPrueba) => disfraz.prendasHogar[0].id;

  async function alquilar(disfraz: DisfrazPrueba, vencido = false) {
    const id = randomUUID();
    alquileres.push(id);
    return prisma.alquiler.create({ data: {
      id, usuarioId: cliente.usuario.id, estado: "ACTIVO", montoTotal: 40, montoGarantia: 10,
      fechaInicio: new Date("2030-06-17T00:00:00Z"),
      fechaFin: new Date(vencido ? "2030-06-18T00:00:00Z" : "2030-06-20T00:00:00Z"),
      disfraces: { create: { disfrazFisicoId: disfraz.id, precioUnitario: 40 } },
    } });
  }

  async function devolver(disfraz: DisfrazPrueba, alquilerId: string, estadoPrenda: "BUEN_ESTADO" | "DANADA" | "FALTANTE" = "BUEN_ESTADO") {
    const respuesta = await http("/devoluciones", "POST", {
      alquilerId, fechaDevolucion: "2030-06-19", prendas: [{ prendaId: prendaId(disfraz), estadoPrenda }],
    }, cliente.accessToken);
    expect(respuesta.status).toBe(201);
    return leerJson<DevolucionCreadaHTTP>(respuesta);
  }

  async function detalle(disfraz: DisfrazPrueba) {
    const respuesta = await http(`/disfraces/${disfraz.id}/inventario`);
    expect(respuesta.status).toBe(200);
    return leerJson<DisfrazHTTP>(respuesta);
  }

  async function prestar(destino: DisfrazPrueba, origen: DisfrazPrueba) {
    return http(`/disfraces/prendas/${prendaId(destino)}/prestamo`, "POST", { prendaDonanteId: prendaId(origen) });
  }

  it("TC-BE-INV-04: una prenda física tiene una sola ubicación y no puede prestarse a dos disfraces", async () => {
    const origen = await crearDisfraz("origen");
    const primero = await crearDisfraz("primero");
    const segundo = await crearDisfraz("segundo");
    expect(new Set([prendaId(origen), prendaId(primero), prendaId(segundo)]).size).toBe(3);
    await prisma.prenda.updateMany({ where: { id: { in: [prendaId(primero), prendaId(segundo)] } }, data: { estado: "DANADA" } });
    expect((await prestar(primero, origen)).status).toBe(201);
    expect((await prestar(segundo, origen)).status).toBe(409);
    const ubicacion = await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId(origen) } });
    expect(ubicacion).toMatchObject({ disfrazHogarId: origen.id, disfrazActualId: primero.id });
    expect(await prisma.prenda.count({ where: { id: ubicacion.id } })).toBe(1);
    expect(await prisma.sustitucion.count({ where: { prendaId: ubicacion.id } })).toBe(1);
    const primeroActual = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: primero.id }, include: { prendasActuales: true } });
    const segundoActual = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: segundo.id }, include: { prendasActuales: true } });
    expect(primeroActual.prendasActuales.map(p => p.id)).toContain(ubicacion.id);
    expect(segundoActual.prendasActuales.map(p => p.id)).not.toContain(ubicacion.id);
    expect(await detalle(segundo)).toMatchObject({ completo: false, faltantes: 1 });
  });

  it("TC-BE-SUS-01: devolver una prenda dañada o faltante asigna un equivalente y registra la sustitución", async () => {
    for (const estado of ["DANADA", "FALTANTE"] as const) {
      const grupo = `${prefijo}-${estado}`;
      const destino = await crearDisfraz(`destino-${estado}`, grupo);
      const origen = await crearDisfraz(`donante-${estado}`, grupo);
      const alquiler = await alquilar(destino);
      const resultado = await devolver(destino, alquiler.id, estado);
      expect(resultado.sustituciones).toHaveLength(1);
      expect(await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId(destino) } })).toMatchObject({ estado, disfrazHogarId: destino.id });
      const repuesto = await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId(origen) } });
      expect(repuesto).toMatchObject({ tipo: "CAMISA", talla: "M", color: "Rojo", estado: "DISPONIBLE", disfrazActualId: destino.id, disfrazHogarId: origen.id });
      const sustituciones = await prisma.sustitucion.findMany({ where: { disfrazDestinoId: destino.id } });
      expect(sustituciones).toHaveLength(1);
      expect(sustituciones[0]).toMatchObject({ prendaId: repuesto.id, disfrazOrigenId: origen.id, disfrazDestinoId: destino.id });
      expect(sustituciones[0].motivo).toMatch(estado === "DANADA" ? /dañada/ : /faltante/);
      expect(await detalle(destino)).toMatchObject({ completo: true, faltantes: 0 });
    }
  });

  it("TC-BE-SUS-02: el donante queda incompleto y un donante alquilado no puede ceder su prenda", async () => {
    const destino = await crearDisfraz("sustituido", `${prefijo}-libre`);
    const origen = await crearDisfraz("donante-libre", `${prefijo}-libre`);
    const alquiler = await alquilar(destino);
    await devolver(destino, alquiler.id, "DANADA");
    expect(await detalle(origen)).toMatchObject({ estado: "INCOMPLETO", completo: false, faltantes: 1, prestamosSalientes: 1 });

    const bloqueado = await crearDisfraz("donante-alquilado", `${prefijo}-ocupado`);
    const necesitado = await crearDisfraz("sin-reemplazo", `${prefijo}-ocupado`);
    await alquilar(bloqueado);
    const otroAlquiler = await alquilar(necesitado);
    const resultado = await devolver(necesitado, otroAlquiler.id, "FALTANTE");
    expect(resultado.sustituciones).toEqual([]);
    const manual = await prestar(necesitado, bloqueado);
    expect(manual.status).toBe(409);
    expect((await leerJson<MensajeHTTP>(manual)).mensaje).toMatch(/donante.*alquilado/i);
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: prendaId(bloqueado) } })).toMatchObject({ disfrazActualId: bloqueado.id });
    expect(await prisma.sustitucion.count({ where: { disfrazDestinoId: necesitado.id } })).toBe(0);
    expect(await detalle(necesitado)).toMatchObject({ completo: false, faltantes: 1 });
  });

  it("TC-BE-INV-05: la API del panel entrega tipo y estado de cada disfraz y permite filtrar por tipo", async () => {
    const disponible = await crearDisfraz("disponible");
    const incompleto = await crearDisfraz("incompleto");
    const alquilado = await crearDisfraz("alquilado", prefijo, "Historico");
    await prisma.prenda.update({ where: { id: prendaId(incompleto) }, data: { estado: "FALTANTE" } });
    await alquilar(alquilado);
    const respuesta = await http(`/disfraces?nombre=${prefijo}`);
    expect(respuesta.status).toBe(200);
    const lista = await leerJson<DisfrazHTTP[]>(respuesta);
    expect(lista).toHaveLength(3);
    expect(lista).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: disponible.id, tipoDisfraz: "Fantasia", estado: "DISPONIBLE" }),
      expect.objectContaining({ id: incompleto.id, tipoDisfraz: "Fantasia", estado: "INCOMPLETO" }),
      expect.objectContaining({ id: alquilado.id, tipoDisfraz: "Historico", estado: "ALQUILADO" }),
    ]));
    const filtrada = await http(`/disfraces?nombre=${prefijo}&tipos=Historico`);
    expect(filtrada.status).toBe(200);
    expect((await leerJson<DisfrazHTTP[]>(filtrada)).map((disfraz: { id: string }) => disfraz.id)).toEqual([alquilado.id]);
  });

  it("TC-BE-INV-07: un alquiler vigente o vencido bloquea edición, préstamos y devolución de prendas prestadas", async () => {
    for (const vencido of [false, true]) {
      const grupo = `${prefijo}-${vencido}`;
      const destino = await crearDisfraz(`bloqueado-${vencido}`, grupo);
      const origen = await crearDisfraz(`prestamista-${vencido}`, grupo);
      const otro = await crearDisfraz(`otro-${vencido}`, grupo);
      await prisma.prenda.update({ where: { id: prendaId(destino) }, data: { estado: "DANADA" } });
      expect((await prestar(destino, origen)).status).toBe(201);
      await alquilar(destino, vencido);
      const antes = await prisma.prenda.findMany({ where: { disfrazHogarId: { in: [destino.id, origen.id, otro.id] } }, orderBy: { id: "asc" } });
      const acciones = [
        () => http(`/disfraces/${destino.id}/estado-manual`, "PATCH", { estado: "EN_REPARACION" }),
        () => http(`/disfraces/prendas/${prendaId(destino)}`, "PATCH", { estado: "DISPONIBLE" }),
        () => http(`/disfraces/prendas/${prendaId(origen)}`, "PATCH", { calidad: "modificada" }),
        () => prestar(destino, otro),
        () => http(`/disfraces/prendas/${prendaId(origen)}/devolver-prestamo`, "POST", {}),
      ];
      for (const accion of acciones) {
        const respuesta = await accion();
        expect(respuesta.status).toBe(409);
        expect((await leerJson<MensajeHTTP>(respuesta)).mensaje).toMatch(/alquilado/i);
      }
      expect(await prisma.prenda.findMany({ where: { disfrazHogarId: { in: [destino.id, origen.id, otro.id] } }, orderBy: { id: "asc" } })).toEqual(antes);
      expect((await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: destino.id } })).estadoManual).toBeNull();
      expect(await prisma.sustitucion.count({ where: { disfrazDestinoId: destino.id } })).toBe(1);
      expect(await detalle(destino)).toMatchObject({ estado: "ALQUILADO" });
    }
  });

  it("TC-BE-LAV-01: una devolución real cierra el alquiler y deja al disfraz suspendido en lavado", async () => {
    const disfraz = await crearDisfraz("lavado");
    const alquiler = await alquilar(disfraz);
    await devolver(disfraz, alquiler.id);
    expect((await prisma.alquiler.findUniqueOrThrow({ where: { id: alquiler.id } })).estado).toBe("FINALIZADO");
    expect(await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: disfraz.id } })).toMatchObject({ estadoManual: "SUSPENDIDO", fechaSuspension: ahora });
    expect(await detalle(disfraz)).toMatchObject({ estado: "SUSPENDIDO", faseLavado: "LAVADO", completo: true });
  });

  it("TC-BE-LAV-03: terminado el lavado un disfraz incompleto sigue sin estar disponible hasta reparar su prenda", async () => {
    const disfraz = await crearDisfraz("lavado-incompleto", `${prefijo}-sin-donantes`);
    const alquiler = await alquilar(disfraz);
    expect((await devolver(disfraz, alquiler.id, "DANADA")).sustituciones).toEqual([]);
    expect(await detalle(disfraz)).toMatchObject({ estado: "SUSPENDIDO", completo: false });
    // Viernes 14 -> miércoles 19: tres días hábiles, sin contar el fin de semana.
    await prisma.disfrazFisico.update({ where: { id: disfraz.id }, data: { fechaSuspension: new Date("2030-06-14T12:00:00Z") } });
    for (let consulta = 0; consulta < 2; consulta++) {
      expect(await detalle(disfraz)).toMatchObject({ estado: "INCOMPLETO", completo: false, faltantes: 1, faseLavado: null });
    }
    const reparacion = await http(`/disfraces/prendas/${prendaId(disfraz)}`, "PATCH", { estado: "DISPONIBLE" });
    expect(reparacion.status).toBe(200);
    expect(await detalle(disfraz)).toMatchObject({ estado: "DISPONIBLE", completo: true, faltantes: 0 });
  });
});
