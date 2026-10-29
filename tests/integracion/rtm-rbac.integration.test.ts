import { leerJson, type PerfilHTTP, type IdHTTP, type DevolucionCreadaHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

// Primera hoja de la RTM, HU-22. Sin mocks de autenticación ni de PostgreSQL.
describe("RTM — autorización por rol y propiedad", () => {
  const prefijo = `rtm-rbac-${randomUUID()}`;
  const disfraces: string[] = [];
  const alquileres: string[] = [];
  let server: Server | undefined;
  let base: string;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let otro: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    const datos = { nombre: "Usuario RTM RBAC", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    admin = await registrarUsuario({ ...datos, email: `${prefijo}-admin@test.local` });
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    otro = await registrarUsuario({ ...datos, email: `${prefijo}-otro@test.local` });
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
      await prisma.$disconnect();
    }
  });

  function http(ruta: string, token: string | null, method = "GET", body?: unknown) {
    return fetch(`${base}${ruta}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function prepararAlquiler(usuarioId: string) {
    const id = randomUUID();
    disfraces.push(id);
    const disfraz = await prisma.disfrazFisico.create({ data: {
      id, nombre: `${prefijo}-${id}`, tipoDisfraz: "Fantasia", temporadaEvento: "rtm", precioAlquiler: 40,
      prendasHogar: { create: { nombre: `${prefijo}-camisa`, tipo: "CAMISA", talla: "M", color: "Rojo", disfrazActualId: id } },
    }, include: { prendasHogar: true } });
    const alquilerId = randomUUID();
    alquileres.push(alquilerId);
    const alquiler = await prisma.alquiler.create({ data: {
      id: alquilerId, usuarioId, estado: "ACTIVO", montoTotal: 40, montoGarantia: 10, fechaInicio: new Date(), fechaFin: new Date(),
      disfraces: { create: { disfrazFisicoId: id, precioUnitario: 40 } },
    } });
    return { alquiler, disfraz, prenda: disfraz.prendasHogar[0] };
  }

  it("TC-BE-RBAC-01: un cliente recibe 403 en rutas administrativas y no puede cambiar roles", async () => {
    const id = randomUUID();
    const rutas: [string, string, unknown?][] = [
      ["GET", "/auth/usuarios"],
      ["PATCH", `/auth/usuarios/${otro.usuario.id}/rol`, { rol: "ADMINISTRADOR" }],
      ["GET", "/alquileres/admin/todos"], ["GET", "/alquileres/admin/resumen"], ["POST", "/alquileres", {}],
      ["GET", "/proveedores"], ["POST", "/proveedores", {}], ["POST", `/proveedores/${id}/piezas`, {}],
      ["GET", "/devoluciones"], ["PATCH", `/devoluciones/${id}/prendas/${id}`, {}], ["POST", `/devoluciones/${id}/garantia`, {}],
      ["POST", "/disfraces", {}], ["GET", `/disfraces/${id}/inventario`], ["PATCH", `/disfraces/${id}/estado-manual`, {}],
      ["PATCH", `/disfraces/prendas/${id}`, {}], ["GET", `/disfraces/prendas/${id}/candidatos`],
      ["POST", `/disfraces/prendas/${id}/prestamo`, {}], ["POST", `/disfraces/prendas/${id}/devolver-prestamo`, {}],
      ["GET", "/recetas"], ["POST", "/recetas", {}], ["PUT", `/recetas/${id}`, {}], ["PATCH", `/recetas/${id}/activa`, {}], ["DELETE", `/recetas/${id}`],
      ["GET", "/almacen"], ["POST", "/almacen/piezas", {}], ["POST", "/almacen/piezas/retirar", {}],
      ["GET", "/a-medida/admin/demanda"], ["POST", "/a-medida/admin/demanda/atendida", {}], ["GET", "/a-medida/admin/en-curso"],
    ];
    for (const [method, ruta, body] of rutas) {
      const respuesta = await http(ruta, cliente.accessToken, method, body);
      expect(respuesta.status, `${method} ${ruta}`).toBe(403);
      expect(await respuesta.json()).toEqual({ mensaje: "No tienes permisos para esta acción" });
    }
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: otro.usuario.id } })).rol).toBe("CLIENTE");
    expect((await http("/auth/usuarios", null)).status).toBe(401);
    expect((await http("/auth/usuarios", admin.accessToken)).status).toBe(200);
    expect((await http("/proveedores", admin.accessToken)).status).toBe(200);
  });

  it("TC-BE-RBAC-02: un cliente solo consulta sus alquileres y no registra ni consulta devoluciones ajenas", async () => {
    const propio = await prepararAlquiler(cliente.usuario.id);
    const ajeno = await prepararAlquiler(otro.usuario.id);
    // Los filtros manipulados no deben sustituir la identidad verificada por el JWT.
    const mios = await http(`/alquileres/mios?usuarioId=${otro.usuario.id}&alquilerId=${ajeno.alquiler.id}`, cliente.accessToken);
    expect(mios.status).toBe(200);
    const lista = await leerJson<IdHTTP[]>(mios);
    expect(lista.map((alquiler: { id: string }) => alquiler.id)).toEqual([propio.alquiler.id]);
    const reporte = { alquilerId: ajeno.alquiler.id, usuarioId: otro.usuario.id, fechaDevolucion: new Date().toISOString(), prendas: [{ prendaId: ajeno.prenda.id, estadoPrenda: "BUEN_ESTADO" }] };
    const ataque = await http("/devoluciones", cliente.accessToken, "POST", reporte);
    expect(ataque.status).toBe(404);
    expect(await ataque.json()).toEqual({ mensaje: "Alquiler no encontrado" });
    expect(await prisma.devolucion.count({ where: { alquilerId: ajeno.alquiler.id } })).toBe(0);
    expect((await prisma.alquiler.findUniqueOrThrow({ where: { id: ajeno.alquiler.id } })).estado).toBe("ACTIVO");
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: ajeno.prenda.id } })).toEqual(ajeno.prenda);
    // Control positivo: el mismo recurso existe y su propietario sí puede devolverlo.
    const legitima = await http("/devoluciones", otro.accessToken, "POST", reporte);
    expect(legitima.status).toBe(201);
    const { devolucion } = await leerJson<DevolucionCreadaHTTP>(legitima);
    expect((await http(`/devoluciones?usuarioId=${otro.usuario.id}`, cliente.accessToken)).status).toBe(403);
    const listadoAjeno = await http("/alquileres/mios", otro.accessToken);
    expect(listadoAjeno.status).toBe(200);
    expect((await leerJson<IdHTTP[]>(listadoAjeno))[0]).toMatchObject({ id: ajeno.alquiler.id, devolucion: { garantiaEstado: "PENDIENTE" } });
    const listadoPropio = await http("/alquileres/mios", cliente.accessToken);
    expect(listadoPropio.status).toBe(200);
    expect(JSON.stringify(await listadoPropio.json())).not.toContain(ajeno.alquiler.id);
    expect((await http(`/devoluciones/${devolucion.id}/garantia`, cliente.accessToken, "POST", { accion: "DEVOLVER" })).status).toBe(403);
    expect((await prisma.devolucion.findUniqueOrThrow({ where: { id: devolucion.id } })).garantiaEstado).toBe("PENDIENTE");
  });

  it("TC-BE-RBAC-03: cambiar el rol por HTTP concede y revoca permisos usando el mismo access token", async () => {
    const tokenOriginal = cliente.accessToken;
    const payload = jwt.verify(tokenOriginal, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload.rol).toBe("CLIENTE");
    expect((await http("/auth/usuarios", tokenOriginal)).status).toBe(403);
    const ruta = `/auth/usuarios/${cliente.usuario.id}/rol`;
    const ascenso = await http(ruta, admin.accessToken, "PATCH", { rol: "ADMINISTRADOR" });
    expect(ascenso.status).toBe(200);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.usuario.id } })).rol).toBe("ADMINISTRADOR");
    expect((await http("/auth/usuarios", tokenOriginal)).status).toBe(200);
    expect((await http("/proveedores", tokenOriginal)).status).toBe(200);
    const descenso = await http(ruta, admin.accessToken, "PATCH", { rol: "CLIENTE" });
    expect(descenso.status).toBe(200);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: cliente.usuario.id } })).rol).toBe("CLIENTE");
    expect((await http("/auth/usuarios", tokenOriginal)).status).toBe(403);
    expect((await http("/proveedores", tokenOriginal)).status).toBe(403);
    expect(await prisma.sesionActiva.findUnique({ where: { tokenId: payload.jti } })).not.toBeNull();
    const perfil = await http("/auth/perfil", tokenOriginal);
    expect(perfil.status).toBe(200);
    expect((await leerJson<PerfilHTTP>(perfil)).usuario.rol).toBe("CLIENTE");
  });
});
