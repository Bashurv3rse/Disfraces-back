import type {
  NextFunction,
  Request,
  Response,
} from "express";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prisma } from "../../src/config/prisma";
import {
  verificarToken,
  requiereRol,
} from "../../src/modules/auth/auth.middleware";
import { cerrarSesionesUsuario } from "../../src/modules/auth/auth.service";

const JWT_SECRET = process.env.JWT_SECRET as string;

describe("Pruebas de integración - autenticación y sesiones", () => {
  const emailPrueba = "integracion-auth@test.local";

  async function limpiarDatos() {
    const usuario = await prisma.usuario.findUnique({
      where: {
        email: emailPrueba,
      },
    });

    if (!usuario) {
      return;
    }

    await prisma.sesionActiva.deleteMany({
      where: {
        usuarioId: usuario.id,
      },
    });

    await prisma.usuario.delete({
      where: {
        id: usuario.id,
      },
    });
  }

  async function crearUsuario(
    rol: "CLIENTE" | "ADMINISTRADOR" | "PROVEEDOR" = "CLIENTE"
  ) {
    const password = await bcrypt.hash("Clave123!", 10);

    return prisma.usuario.create({
      data: {
        nombre: "Usuario Integración",
        email: emailPrueba,
        password,
        telefono: "987654321",
        direccion: "Dirección de prueba",
        rol,
      },
    });
  }

  function crearRespuestaMock() {
    const json = vi.fn();

    const status = vi.fn(() => ({
      json,
    }));

    const res = {
      status,
      json,
    } as unknown as Response;

    return {
      res,
      status,
      json,
    };
  }

  beforeEach(async () => {
    await limpiarDatos();
  });

  afterAll(async () => {
    await limpiarDatos();
    await prisma.$disconnect();
  });

  it("PI-01: permite autenticar un token válido asociado a una sesión activa", async () => {
    const usuario = await crearUsuario("CLIENTE");

    const jti = "sesion-integracion-pi01";

    await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        tokenId: jti,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: usuario.rol,
        jti,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    await verificarToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();

    expect(req.usuario).toEqual({
      id: usuario.id,
      rol: "CLIENTE",
    });
  });

  it("PI-02: rechaza un token JWT inválido", async () => {
    const req = {
      headers: {
        authorization: "Bearer token-completamente-invalido",
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    await verificarToken(req, res, next);

    expect(status).toHaveBeenCalledWith(401);

    expect(json).toHaveBeenCalledWith({
      mensaje: "Token inválido o expirado",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("PI-03: rechaza un token firmado correctamente pero sin jti", async () => {
    const usuario = await crearUsuario("CLIENTE");

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: usuario.rol,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    await verificarToken(req, res, next);

    expect(status).toHaveBeenCalledWith(401);

    expect(json).toHaveBeenCalledWith({
      mensaje: "Token inválido. Vuelve a iniciar sesión.",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("TC-BE-AUTH-11: rechaza un access token cuando su sesión fue revocada", async () => {
    const usuario = await crearUsuario("CLIENTE");

    const jti = "sesion-integracion-pi04";

    await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        tokenId: jti,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: usuario.rol,
        jti,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    await prisma.sesionActiva.delete({
      where: {
        tokenId: jti,
      },
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    await verificarToken(req, res, next);

    expect(status).toHaveBeenCalledWith(401);

    expect(json).toHaveBeenCalledWith({
      mensaje: "Esta sesión fue cerrada. Vuelve a iniciar sesión.",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("PI-05: utiliza el rol vigente de PostgreSQL y no el rol almacenado originalmente en el JWT", async () => {
    const usuario = await crearUsuario("CLIENTE");

    const jti = "sesion-integracion-pi05";

    await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        tokenId: jti,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: "CLIENTE",
        jti,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    await prisma.usuario.update({
      where: {
        id: usuario.id,
      },
      data: {
        rol: "ADMINISTRADOR",
      },
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    await verificarToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();

    expect(req.usuario).toEqual({
      id: usuario.id,
      rol: "ADMINISTRADOR",
    });
  });

  it("TC-BE-AUTH-10: cerrar sesión revoca todas las sesiones activas del usuario", async () => {
    const usuario = await crearUsuario("CLIENTE");

    await prisma.sesionActiva.createMany({
      data: [
        {
          usuarioId: usuario.id,
          tokenId: "sesion-integracion-pi06-dispositivo-1",
          expiraEn: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          usuarioId: usuario.id,
          tokenId: "sesion-integracion-pi06-dispositivo-2",
          expiraEn: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          usuarioId: usuario.id,
          tokenId: "sesion-integracion-pi06-dispositivo-3",
          expiraEn: new Date(Date.now() + 60 * 60 * 1000),
        },
      ],
    });

    const sesionesAntes = await prisma.sesionActiva.count({
      where: {
        usuarioId: usuario.id,
      },
    });

    expect(sesionesAntes).toBe(3);

    await cerrarSesionesUsuario(usuario.id);

    const sesionesDespues = await prisma.sesionActiva.count({
      where: {
        usuarioId: usuario.id,
      },
    });

    expect(sesionesDespues).toBe(0);
  });

  it("PI-07: permite acceso a una ruta protegida cuando el usuario tiene el rol requerido", async () => {
    const usuario = await crearUsuario("ADMINISTRADOR");

    const jti = "sesion-integracion-pi07";

    await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        tokenId: jti,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: usuario.rol,
        jti,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const nextAutenticacion = vi.fn() as NextFunction;

    await verificarToken(
      req,
      res,
      nextAutenticacion
    );

    expect(nextAutenticacion).toHaveBeenCalledTimes(1);

    const nextAutorizacion = vi.fn() as NextFunction;

    requiereRol("ADMINISTRADOR")(
      req,
      res,
      nextAutorizacion
    );

    expect(nextAutorizacion).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("PI-08: rechaza con 403 a un usuario autenticado que no posee el rol requerido", async () => {
    const usuario = await crearUsuario("CLIENTE");

    const jti = "sesion-integracion-pi08";

    await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        tokenId: jti,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: usuario.rol,
        jti,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const nextAutenticacion = vi.fn() as NextFunction;

    await verificarToken(
      req,
      res,
      nextAutenticacion
    );

    expect(nextAutenticacion).toHaveBeenCalledTimes(1);

    const nextAutorizacion = vi.fn() as NextFunction;

    requiereRol("ADMINISTRADOR")(
      req,
      res,
      nextAutorizacion
    );

    expect(status).toHaveBeenCalledWith(403);

    expect(json).toHaveBeenCalledWith({
      mensaje: "No tienes permisos para esta acción",
    });

    expect(nextAutorizacion).not.toHaveBeenCalled();
  });

  it("PI-09: un cambio de rol en PostgreSQL modifica inmediatamente los permisos del usuario", async () => {
    const usuario = await crearUsuario("CLIENTE");

    const jti = "sesion-integracion-pi09";

    await prisma.sesionActiva.create({
      data: {
        usuarioId: usuario.id,
        tokenId: jti,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const token = jwt.sign(
      {
        sub: usuario.id,
        rol: "CLIENTE",
        jti,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    // El usuario cambia a ADMINISTRADOR después de haberse
    // emitido el JWT como CLIENTE.
    await prisma.usuario.update({
      where: {
        id: usuario.id,
      },
      data: {
        rol: "ADMINISTRADOR",
      },
    });

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const nextAutenticacion = vi.fn() as NextFunction;

    await verificarToken(
      req,
      res,
      nextAutenticacion
    );

    expect(nextAutenticacion).toHaveBeenCalledTimes(1);

    // Debe haberse recuperado ADMINISTRADOR desde PostgreSQL,
    // aunque el JWT todavía diga CLIENTE.
    expect(req.usuario).toEqual({
      id: usuario.id,
      rol: "ADMINISTRADOR",
    });

    const nextAutorizacion = vi.fn() as NextFunction;

    requiereRol("ADMINISTRADOR")(
      req,
      res,
      nextAutorizacion
    );

    expect(nextAutorizacion).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});