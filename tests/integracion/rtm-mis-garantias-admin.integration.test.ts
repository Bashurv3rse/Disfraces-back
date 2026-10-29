import { leerJson, type MensajeHTTP, type IdHTTP, type DisfrazHTTP, type DevolucionCreadaHTTP, type AlquilerConGarantiaHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

// Primera hoja: últimos casos de integración del backend, HU-42 y HU-43.
describe("RTM — garantías propias y creación administrativa", () => {
  const prefijo = `rtmfinal-${randomUUID()}`;
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let otro: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;
  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    const datos = { nombre: "Cliente RTM", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    otro = await registrarUsuario({ ...datos, email: `${prefijo}-otro@test.local` });
    admin = await registrarUsuario({ ...datos, email: `${prefijo}-admin@test.local` });
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  async function limpiarDatos() {
    const alquileres = await prisma.alquiler.findMany({ where: { usuario: { email: { startsWith: prefijo } } }, select: { id: true } });
    const ids = alquileres.map(a => a.id);
    const devs = await prisma.devolucion.findMany({ where: { alquilerId: { in: ids } }, select: { id: true } });
    await prisma.devolucionPrenda.deleteMany({ where: { devolucionId: { in: devs.map(d => d.id) } } });
    await prisma.devolucion.deleteMany({ where: { alquilerId: { in: ids } } });
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: ids } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: ids } } });
    await prisma.prenda.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.disfrazFisico.deleteMany({ where: { nombre: { startsWith: prefijo } } });
  }
  afterEach(limpiarDatos);
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
  function datosDisfraz() {
    return { nombre: `${prefijo}-${randomUUID()}`, tipoDisfraz: "Fantasia", temporadaEvento: "Halloween", precioAlquiler: 55.5, prendas: [
      { nombre: `${prefijo}-camisa`, tipo: "CAMISA", color: "Rojo", talla: "M" },
      { nombre: `${prefijo}-zapato`, tipo: "ZAPATO", color: "Negro", talla: "40" },
    ] };
  }
  async function crearDisfraz(datos = datosDisfraz()) {
    const respuesta = await http("/disfraces", "POST", datos);
    expect(respuesta.status).toBe(201);
    return leerJson<DisfrazHTTP>(respuesta);
  }
  async function prepararGarantia(persona = cliente, accion?: "DEVOLVER" | "RETENER", motivo?: string) {
    const disfraz = await crearDisfraz();
    const alquiler = await prisma.alquiler.create({ data: { usuarioId: persona.usuario.id, estado: "ACTIVO", fechaInicio: new Date(), fechaFin: new Date(), montoTotal: 40, montoGarantia: 10, disfraces: { create: { disfrazFisicoId: disfraz.id, precioUnitario: 40 } } } });
    const respuesta = await http("/devoluciones", "POST", { alquilerId: alquiler.id, fechaDevolucion: new Date().toISOString(), prendas: disfraz.prendasHogar.map((p: { id: string }) => ({ prendaId: p.id, estadoPrenda: "BUEN_ESTADO" })) }, persona.accessToken);
    expect(respuesta.status).toBe(201);
    const { devolucion } = await leerJson<DevolucionCreadaHTTP>(respuesta);
    // Alquiler sin sesión Stripe: la garantía se decide en mostrador.
    if (accion) expect((await http(`/devoluciones/${devolucion.id}/garantia`, "POST", { accion, motivo })).status).toBe(200);
    return { alquiler, devolucion, disfraz };
  }

  it("TC-BE-GAR-08: Mis alquileres devuelve estado, monto y motivo de garantías pendientes, devueltas y retenidas", async () => {
    const pendiente = await prepararGarantia();
    const devuelta = await prepararGarantia(cliente, "DEVOLVER", "Inspección conforme");
    const retenida = await prepararGarantia(cliente, "RETENER", "Retención decidida por el administrador");
    const respuesta = await http("/alquileres/mios", "GET", undefined, cliente.accessToken);
    expect(respuesta.status).toBe(200);
    const lista = await leerJson<AlquilerConGarantiaHTTP[]>(respuesta);
    expect(lista).toHaveLength(3);
    for (const [datos, estado, motivo] of [
      [pendiente, "PENDIENTE", null], [devuelta, "DEVUELTA", "Inspección conforme"], [retenida, "RETENIDA", "Retención decidida por el administrador"],
    ] as const) {
      const fila = lista.find((a: { id: string }) => a.id === datos.alquiler.id);
      if (!fila) throw new Error(`No se encontró el alquiler esperado: ${datos.alquiler.id}`);
      expect(fila.devolucion).toMatchObject({ garantiaEstado: estado, garantiaMotivo: motivo, garantiaReembolsoId: null });
      expect(fila.devolucion.garantiaMonto === null ? null : Number(fila.devolucion.garantiaMonto)).toBe(estado === "PENDIENTE" ? null : 10);
      expect(fila.devolucion.garantiaResueltaEn === null).toBe(estado === "PENDIENTE");
      expect(fila.devolucion.prendas).toHaveLength(2);
      const registro = await prisma.devolucion.findUniqueOrThrow({ where: { id: datos.devolucion.id } });
      expect(fila.devolucion.garantiaEstado).toBe(registro.garantiaEstado);
    }
  });

  it("TC-BE-GAR-09: manipular el usuario o la devolución solicitados no expone garantías de otro cliente", async () => {
    const propia = await prepararGarantia(cliente, "RETENER", "Motivo privado del primer cliente");
    const ajena = await prepararGarantia(otro, "DEVOLVER", "Motivo privado del segundo cliente");
    for (const [persona, esperado, prohibido, motivoAjeno] of [
      [cliente, propia, ajena, "Motivo privado del segundo cliente"],
      [otro, ajena, propia, "Motivo privado del primer cliente"],
    ] as const) {
      const respuesta = await http(`/alquileres/mios?usuarioId=${prohibido.alquiler.usuarioId}&devolucionId=${prohibido.devolucion.id}`, "GET", undefined, persona.accessToken);
      expect(respuesta.status).toBe(200);
      const lista = await leerJson<AlquilerConGarantiaHTTP[]>(respuesta);
      expect(lista.map((a: { id: string }) => a.id)).toEqual([esperado.alquiler.id]);
      const texto = JSON.stringify(lista);
      for (const dato of [prohibido.alquiler.id, prohibido.devolucion.id, motivoAjeno]) expect(texto).not.toContain(dato);
      expect((await http("/devoluciones", "GET", undefined, persona.accessToken)).status).toBe(403);
    }
  });

  it("TC-BE-ADM-01: el administrador crea un disfraz completo con prendas, talla, color y tipo persistidos", async () => {
    const datos = datosDisfraz();
    const creado = await crearDisfraz(datos);
    expect(creado).toMatchObject({ nombre: datos.nombre, estado: "DISPONIBLE", completo: true, faltantes: 0 });
    const registro = await prisma.disfrazFisico.findUniqueOrThrow({ where: { id: creado.id }, include: { prendasHogar: true, prendasActuales: true } });
    expect(registro.precioAlquiler.toNumber()).toBe(55.5);
    expect(registro.temporadaEvento).toBe("halloween");
    expect(registro.prendasHogar).toHaveLength(2);
    expect(registro.prendasActuales).toHaveLength(2);
    expect(new Set(registro.prendasHogar.map(p => p.id)).size).toBe(2);
    for (const prenda of datos.prendas) expect(registro.prendasHogar).toContainEqual(expect.objectContaining({ ...prenda, estado: "DISPONIBLE", disfrazHogarId: creado.id, disfrazActualId: creado.id }));
    const catalogo = await http(`/disfraces?nombre=${encodeURIComponent(datos.nombre)}`);
    expect(catalogo.status).toBe(200);
    expect((await leerJson<IdHTTP[]>(catalogo)).map((d: { id: string }) => d.id)).toEqual([creado.id]);
  });

  it("TC-BE-ADM-03: un cliente no puede crear disfraces aunque declare un rol o usuario administrador", async () => {
    const datos = datosDisfraz();
    const respuesta = await http("/disfraces", "POST", { ...datos, rol: "ADMINISTRADOR", usuarioId: admin.usuario.id }, cliente.accessToken);
    expect(respuesta.status).toBe(403);
    expect((await leerJson<MensajeHTTP>(respuesta)).mensaje).toMatch(/no tienes permisos/i);
    expect((await http("/disfraces", "POST", datos, null)).status).toBe(401);
    expect(await prisma.disfrazFisico.count({ where: { nombre: datos.nombre } })).toBe(0);
    expect(await prisma.prenda.count({ where: { nombre: { startsWith: prefijo } } })).toBe(0);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.usuario.id } })).rol).toBe("CLIENTE");
    // Control positivo: los datos son válidos y el administrador sí puede crearlos.
    await crearDisfraz(datos);
    expect(await prisma.disfrazFisico.count({ where: { nombre: datos.nombre } })).toBe(1);
  });
});
