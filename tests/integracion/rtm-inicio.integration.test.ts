import { leerJson, type ErroresHTTP, type SesionHTTP, type PerfilHTTP, type TokenHTTP, type DisfrazHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { crearDisfraz, listarDisfraces, actualizarPrenda, disfracesNoDisponibles } from "../../src/modules/disfraces/disfraces.service";
import { crearDisfrazSchema } from "../../src/modules/disfraces/disfraces.schema";

// Primera hoja de la RTM, HU-02 a HU-06. Las peticiones recorren las rutas,
// validación, servicios y PostgreSQL reales; no se simula Prisma.
describe("RTM — inicio del backend en orden de la primera hoja", () => {
  const prefijo = `rtm-${randomUUID()}`;
  const email = `${prefijo}@test.local`;
  const password = "PruebaRtm#2026";
  const disfraces: string[] = [];
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
    const ids = usuarios.map(usuario => usuario.id);
    await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.prenda.deleteMany({ where: { disfrazHogarId: { in: disfraces } } });
    await prisma.disfrazFisico.deleteMany({ where: { id: { in: disfraces } } });
    await prisma.$disconnect();
  });

  function post(ruta: string, body: unknown, cookie?: string) {
    return fetch(`${base}/api/auth/${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  }

  function datos(correo = email) {
    return { nombre: "Cliente RTM", email: correo, password, telefono: "987654321", direccion: "Dirección RTM 123" };
  }

  async function crear(nombre: string, tipo = "Fantasia", temporada = "Halloween") {
    const creado = await crearDisfraz(crearDisfrazSchema.parse({
      nombre: `${prefijo}-${nombre}`, tipoDisfraz: tipo, temporadaEvento: temporada, precioAlquiler: 40,
      prendas: [{ nombre: "Camisa RTM", tipo: "CAMISA", color: "Rojo", talla: "M" }],
    }));
    expect(creado).not.toBeNull();
    disfraces.push(creado!.id);
    return creado!;
  }

  it("TC-BE-ENV-01: /health responde y PostgreSQL acepta una consulta real", async () => {
    const respuesta = await fetch(`${base}/health`);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ status: "ok", service: "disfraces-alquiler-backend" });
    expect(await prisma.$queryRaw`SELECT 1 AS conexion`).toEqual([{ conexion: 1 }]);
  });

  it("TC-BE-AUTH-02: rechaza contraseñas débiles por HTTP sin guardar usuarios ni sesiones", async () => {
    for (const debil of ["Aa1!", "clave123!", "CLAVE123!", "ClaveSinNumero!", "Clave1234"]) {
      const respuesta = await post("registro", { ...datos(), password: debil });
      expect(respuesta.status).toBe(400);
      expect((await leerJson<ErroresHTTP>(respuesta)).errores.password).toBeDefined();
    }
    expect(await prisma.usuario.count({ where: { email } })).toBe(0);
    expect(await prisma.sesionActiva.count({ where: { usuario: { email } } })).toBe(0);
  });

  it("TC-BE-AUTH-03: el registro persiste bcrypt y omite la contraseña en la respuesta", async () => {
    const correo = `${prefijo}-hash@test.local`;
    const respuesta = await post("registro", datos(correo));
    expect(respuesta.status).toBe(201);
    const body = await leerJson<SesionHTTP>(respuesta);
    expect(body.usuario).not.toHaveProperty("password");
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: correo } });
    expect(usuario.password).not.toBe(password);
    expect(usuario.password).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(password, usuario.password)).toBe(true);
  });

  it("TC-BE-AUTH-04: el registro ignora el rol solicitado y persiste CLIENTE", async () => {
    const correo = `${prefijo}-rol@test.local`;
    const respuesta = await post("registro", { ...datos(correo), rol: "ADMINISTRADOR" });
    expect(respuesta.status).toBe(201);
    expect((await leerJson<SesionHTTP>(respuesta)).usuario.rol).toBe("CLIENTE");
    expect((await prisma.usuario.findUniqueOrThrow({ where: { email: correo } })).rol).toBe("CLIENTE");
  });

  it("TC-BE-AUTH-06: login entrega access de 15 minutos y refresh de 7 días ligado a una sesión real", async () => {
    expect((await post("registro", datos())).status).toBe(201);
    const respuesta = await post("login", { email, password });
    expect(respuesta.status).toBe(200);
    const body = await leerJson<SesionHTTP>(respuesta);
    const cookie = respuesta.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    const refresh = decodeURIComponent(cookie.match(/refreshToken=([^;]+)/)![1]);
    const access = jwt.verify(body.accessToken, process.env.JWT_SECRET!) as jwt.JwtPayload;
    const renovacion = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET!) as jwt.JwtPayload;
    expect(access.exp! - access.iat!).toBe(15 * 60);
    expect(renovacion.exp! - renovacion.iat!).toBe(7 * 24 * 60 * 60);
    expect(access.jti).toBe(renovacion.jti);
    const sesion = await prisma.sesionActiva.findUniqueOrThrow({ where: { tokenId: access.jti } });
    expect(sesion.usuarioId).toBe(body.usuario.id);
    expect(Math.abs(sesion.expiraEn.getTime() - renovacion.exp! * 1000)).toBeLessThan(1000);
  });

  it("TC-BE-AUTH-08: refresh renueva el access sin credenciales y permite acceder al perfil", async () => {
    const correo = `${prefijo}-refresh@test.local`;
    expect((await post("registro", datos(correo))).status).toBe(201);
    const login = await post("login", { email: correo, password });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const respuesta = await post("refrescar", {}, cookie);
    expect(respuesta.status).toBe(200);
    const { accessToken } = await leerJson<TokenHTTP>(respuesta);
    const perfil = await fetch(`${base}/api/auth/perfil`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(perfil.status).toBe(200);
    expect((await leerJson<PerfilHTTP>(perfil)).usuario.email).toBe(correo);
  });

  it("TC-BE-CAT-01: combina texto, tipo y temporada sin incluir coincidencias parciales", async () => {
    const esperado = await crear("busqueda-ok");
    await crear("busqueda-otro-tipo", "Historico");
    await crear("busqueda-otra-temporada", "Fantasia", "Navidad");
    await crear("excluido");
    const resultados = await listarDisfraces({ nombre: `${prefijo}-busqueda`, tipos: ["fantasia"], temporadas: ["halloween"] });
    expect(resultados.map(disfraz => disfraz.id)).toEqual([esperado.id]);
  });

  it("TC-BE-CAT-03: un disfraz incompleto aparece en catálogo y se detecta como no alquilable", async () => {
    const creado = await crear("incompleto");
    const prenda = await prisma.prenda.findFirstOrThrow({ where: { disfrazHogarId: creado.id } });
    await actualizarPrenda(prenda.id, { estado: "DANADA" });
    const resultados = await listarDisfraces({ nombre: creado.nombre });
    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({ id: creado.id, estado: "INCOMPLETO", completo: false });
    const bloqueados = await disfracesNoDisponibles([creado.id]);
    expect(bloqueados.map(disfraz => disfraz.id)).toContain(creado.id);
  });

  it("TC-BE-NFI-01: la búsqueda HTTP devuelve 100 disfraces con prendas en menos de un segundo", async () => {
    const ids = Array.from({ length: 100 }, () => randomUUID());
    // Registrar IDs antes de insertar asegura la limpieza si la preparación falla.
    disfraces.push(...ids);
    await prisma.$transaction([
      prisma.disfrazFisico.createMany({ data: ids.map((id, indice) => ({
        id, nombre: `${prefijo}-volumen-${indice}`, tipoDisfraz: "Fantasia",
        temporadaEvento: "halloween", precioAlquiler: 40,
      })) }),
      prisma.prenda.createMany({ data: ids.map(id => ({
        nombre: "Camisa volumen", tipo: "CAMISA" as const, talla: "M", color: "Rojo",
        disfrazHogarId: id, disfrazActualId: id,
      })) }),
    ]);
    const inicio = performance.now();
    const respuesta = await fetch(`${base}/api/disfraces?nombre=${prefijo}-volumen`);
    const resultados = await leerJson<DisfrazHTTP[]>(respuesta);
    const duracion = performance.now() - inicio;
    expect(respuesta.status).toBe(200);
    expect(resultados).toHaveLength(100);
    expect(resultados.every((disfraz: { completo: boolean }) => disfraz.completo)).toBe(true);
    expect(duracion, "Tiempo HTTP y lectura del JSON con 100 disfraces").toBeLessThan(1000);
  });
});
