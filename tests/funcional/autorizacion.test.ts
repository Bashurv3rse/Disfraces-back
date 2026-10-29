import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  requiereRol,
} from "../../src/modules/auth/auth.middleware";

describe("Pruebas funcionales - autorización por roles", () => {
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

  it("PF-31: rechaza con 403 a una petición sin usuario autenticado", () => {
    const req = {} as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    const middleware = requiereRol("ADMINISTRADOR");

    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);

    expect(json).toHaveBeenCalledWith({
      mensaje: "No tienes permisos para esta acción",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("PF-32: impide a un CLIENTE acceder a una función exclusiva de ADMINISTRADOR", () => {
    const req = {
      usuario: {
        id: "usuario-cliente",
        rol: "CLIENTE",
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    const middleware = requiereRol("ADMINISTRADOR");

    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);

    expect(json).toHaveBeenCalledWith({
      mensaje: "No tienes permisos para esta acción",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("PF-33: permite a un ADMINISTRADOR acceder a una función administrativa", () => {
    const req = {
      usuario: {
        id: "usuario-admin",
        rol: "ADMINISTRADOR",
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    const middleware = requiereRol("ADMINISTRADOR");

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("PF-34: impide a un PROVEEDOR acceder a una función exclusiva de ADMINISTRADOR", () => {
    const req = {
      usuario: {
        id: "usuario-proveedor",
        rol: "PROVEEDOR",
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    const middleware = requiereRol("ADMINISTRADOR");

    middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);

    expect(json).toHaveBeenCalledWith({
      mensaje: "No tienes permisos para esta acción",
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("PF-35: permite el acceso cuando el rol pertenece a cualquiera de los roles autorizados", () => {
    const req = {
      usuario: {
        id: "usuario-proveedor",
        rol: "PROVEEDOR",
      },
    } as Request;

    const {
      res,
      status,
      json,
    } = crearRespuestaMock();

    const next = vi.fn() as NextFunction;

    const middleware = requiereRol(
      "ADMINISTRADOR",
      "PROVEEDOR"
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});