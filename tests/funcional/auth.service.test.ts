import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    sesionActiva: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => "jti-test-123"),
}));

import { prisma } from "../../src/config/prisma";
import {
  ErrorNegocio,
  registrarUsuario,
  iniciarSesion,
  refrescarAccessToken,
  cerrarSesionesUsuario,
  listarUsuarios,
  actualizarRolUsuario,
  obtenerPerfilUsuario,
  actualizarPerfil,
  actualizarTallas,
  cambiarPassword,
} from "../../src/modules/auth/auth.service";

const usuarioBase = {
  id: "usuario-1",
  nombre: "Mauro",
  email: "mauro@test.com",
  password: "hash-password",
  telefono: "999999999",
  direccion: "Lima",
  rol: "CLIENTE" as const,
  creadoEn: new Date("2026-01-01"),
  tallaRopa: "M",
  tallaCalzado: "42",
};

describe("AuthService - pruebas unitarias funcionales", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(jwt.sign).mockReturnValue("token-test" as any);

    vi.mocked(prisma.sesionActiva.create).mockResolvedValue({
      id: "sesion-1",
      usuarioId: "usuario-1",
      tokenId: "jti-test-123",
      expiraEn: new Date(),
      creadoEn: new Date(),
    } as any);
  });

  // =========================================================
  // REGISTRO
  // =========================================================

  it("PF-AUTH-01: registra un usuario nuevo como CLIENTE y elimina la contraseña de la respuesta", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    vi.mocked(bcrypt.hash).mockResolvedValue("password-hasheada" as never);

    vi.mocked(prisma.usuario.create).mockResolvedValue({
      ...usuarioBase,
      password: "password-hasheada",
    } as any);

    const resultado = await registrarUsuario({
      nombre: "Mauro",
      email: "mauro@test.com",
      password: "Password#123",
      telefono: "999999999",
      direccion: "Lima",
    });

    expect(prisma.usuario.create).toHaveBeenCalledWith({
      data: {
        nombre: "Mauro",
        email: "mauro@test.com",
        password: "password-hasheada",
        telefono: "999999999",
        direccion: "Lima",
        rol: "CLIENTE",
      },
    });

    expect(resultado.usuario).not.toHaveProperty("password");
    expect(resultado.usuario.rol).toBe("CLIENTE");
    expect(resultado).toHaveProperty("accessToken");
    expect(resultado).toHaveProperty("refreshToken");
  });

  it("PF-AUTH-02: rechaza el registro cuando el correo ya existe", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    await expect(
      registrarUsuario({
        nombre: "Otro",
        email: "mauro@test.com",
        password: "Password#123",
        telefono: "988888888",
        direccion: "Lima",
      })
    ).rejects.toThrow("Ya existe un usuario registrado con ese email");

    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  // =========================================================
  // LOGIN
  // =========================================================

  it("PF-AUTH-03: inicia sesión con credenciales válidas", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const resultado = await iniciarSesion({
      email: "mauro@test.com",
      password: "Password#123",
    });

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "Password#123",
      "hash-password"
    );

    expect(resultado.usuario).not.toHaveProperty("password");
    expect(resultado).toHaveProperty("accessToken");
    expect(resultado).toHaveProperty("refreshToken");
  });

  it("PF-AUTH-04: rechaza el login cuando el usuario no existe", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    await expect(
      iniciarSesion({
        email: "inexistente@test.com",
        password: "Password#123",
      })
    ).rejects.toThrow("Credenciales inválidas");

    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("PF-AUTH-05: rechaza el login cuando la contraseña es incorrecta", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      iniciarSesion({
        email: "mauro@test.com",
        password: "Incorrecta#123",
      })
    ).rejects.toThrow("Credenciales inválidas");
  });

  // =========================================================
  // REFRESH TOKEN Y SESIONES
  // =========================================================

  it("PF-AUTH-06: genera un nuevo access token cuando el refresh token pertenece a una sesión activa", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      sub: "usuario-1",
      rol: "CLIENTE",
      jti: "jti-test-123",
    } as any);

    vi.mocked(prisma.sesionActiva.findUnique).mockResolvedValue({
      id: "sesion-1",
      usuarioId: "usuario-1",
      tokenId: "jti-test-123",
      expiraEn: new Date(),
      creadoEn: new Date(),
    } as any);

    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    vi.mocked(jwt.sign).mockReturnValue(
      "nuevo-access-token" as any
    );

    const resultado = await refrescarAccessToken(
      "refresh-token-valido"
    );

    expect(resultado.accessToken).toBe("nuevo-access-token");
  });

  it("PF-AUTH-07: rechaza un refresh token inválido o expirado", async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error("jwt expired");
    });

    await expect(
      refrescarAccessToken("token-invalido")
    ).rejects.toThrow("Refresh token inválido o expirado");
  });

  it("PF-AUTH-08: rechaza el refresh cuando la sesión fue cerrada", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      sub: "usuario-1",
      rol: "CLIENTE",
      jti: "jti-test-123",
    } as any);

    vi.mocked(prisma.sesionActiva.findUnique).mockResolvedValue(null);

    await expect(
      refrescarAccessToken("refresh-token")
    ).rejects.toThrow(
      "Esta sesión fue cerrada. Vuelve a iniciar sesión."
    );
  });

  it("PF-AUTH-09: rechaza el refresh cuando la sesión pertenece a otro usuario", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      sub: "usuario-1",
      rol: "CLIENTE",
      jti: "jti-test-123",
    } as any);

    vi.mocked(prisma.sesionActiva.findUnique).mockResolvedValue({
      id: "sesion-1",
      usuarioId: "otro-usuario",
      tokenId: "jti-test-123",
      expiraEn: new Date(),
      creadoEn: new Date(),
    } as any);

    await expect(
      refrescarAccessToken("refresh-token")
    ).rejects.toThrow(
      "Esta sesión fue cerrada. Vuelve a iniciar sesión."
    );
  });

  it("PF-AUTH-10: rechaza el refresh cuando el usuario ya no existe", async () => {
    vi.mocked(jwt.verify).mockReturnValue({
      sub: "usuario-1",
      rol: "CLIENTE",
      jti: "jti-test-123",
    } as any);

    vi.mocked(prisma.sesionActiva.findUnique).mockResolvedValue({
      id: "sesion-1",
      usuarioId: "usuario-1",
      tokenId: "jti-test-123",
      expiraEn: new Date(),
      creadoEn: new Date(),
    } as any);

    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    await expect(
      refrescarAccessToken("refresh-token")
    ).rejects.toThrow("Usuario no encontrado");
  });

  it("PF-AUTH-11: cerrar sesión elimina todas las sesiones activas del usuario", async () => {
    vi.mocked(prisma.sesionActiva.deleteMany).mockResolvedValue({
      count: 2,
    });

    await cerrarSesionesUsuario("usuario-1");

    expect(prisma.sesionActiva.deleteMany).toHaveBeenCalledWith({
      where: {
        usuarioId: "usuario-1",
      },
    });
  });

  // =========================================================
  // ADMINISTRACIÓN DE USUARIOS
  // =========================================================

  it("PF-AUTH-12: lista los usuarios sin solicitar contraseñas", async () => {
    vi.mocked(prisma.usuario.findMany).mockResolvedValue([
      {
        id: "usuario-1",
        nombre: "Mauro",
        email: "mauro@test.com",
        rol: "CLIENTE",
        creadoEn: new Date(),
      },
    ] as any);

    const resultado = await listarUsuarios();

    expect(resultado).toHaveLength(1);

    expect(prisma.usuario.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        creadoEn: true,
      },
      orderBy: {
        creadoEn: "desc",
      },
    });
  });

  it("PF-AUTH-13: impide que un administrador cambie su propio rol", async () => {
    await expect(
      actualizarRolUsuario(
        "admin-1",
        "admin-1",
        "CLIENTE"
      )
    ).rejects.toMatchObject({
      message: "No puedes cambiar tu propio rol.",
      estado: 403,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("PF-AUTH-14: devuelve 404 cuando se intenta cambiar el rol de un usuario inexistente", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: any) => {
        return callback({
          usuario: {
            findUnique: vi.fn().mockResolvedValue(null),
            count: vi.fn(),
            update: vi.fn(),
          },
        });
      }
    );

    await expect(
      actualizarRolUsuario(
        "admin-1",
        "usuario-inexistente",
        "CLIENTE"
      )
    ).rejects.toMatchObject({
      message: "Usuario no encontrado",
      estado: 404,
    });
  });

  it("PF-AUTH-15: impide degradar al último administrador del sistema", async () => {
    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: any) => {
        return callback({
          usuario: {
            findUnique: vi.fn().mockResolvedValue({
              ...usuarioBase,
              id: "admin-2",
              rol: "ADMINISTRADOR",
            }),
            count: vi.fn().mockResolvedValue(1),
            update: vi.fn(),
          },
        });
      }
    );

    await expect(
      actualizarRolUsuario(
        "admin-1",
        "admin-2",
        "CLIENTE"
      )
    ).rejects.toMatchObject({
      message:
        "El sistema debe conservar al menos un administrador.",
      estado: 409,
    });
  });

  it("PF-AUTH-16: permite cambiar el rol cuando existe más de un administrador", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "admin-2",
      nombre: "Administrador 2",
      email: "admin2@test.com",
      rol: "CLIENTE",
      creadoEn: new Date(),
    });

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: any) => {
        return callback({
          usuario: {
            findUnique: vi.fn().mockResolvedValue({
              ...usuarioBase,
              id: "admin-2",
              rol: "ADMINISTRADOR",
            }),
            count: vi.fn().mockResolvedValue(2),
            update,
          },
        });
      }
    );

    const resultado = await actualizarRolUsuario(
      "admin-1",
      "admin-2",
      "CLIENTE"
    );

    expect(resultado.rol).toBe("CLIENTE");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "admin-2",
        },
        data: {
          rol: "CLIENTE",
        },
      })
    );
  });

  it("PF-AUTH-17: permite cambiar el rol de un usuario que no era administrador", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "usuario-1",
      nombre: "Mauro",
      email: "mauro@test.com",
      rol: "ADMINISTRADOR",
      creadoEn: new Date(),
    });

    const count = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation(
      async (callback: any) => {
        return callback({
          usuario: {
            findUnique: vi.fn().mockResolvedValue({
              ...usuarioBase,
              rol: "CLIENTE",
            }),
            count,
            update,
          },
        });
      }
    );

    const resultado = await actualizarRolUsuario(
      "admin-1",
      "usuario-1",
      "ADMINISTRADOR"
    );

    expect(resultado.rol).toBe("ADMINISTRADOR");
    expect(count).not.toHaveBeenCalled();
  });

  it("PF-AUTH-18: transforma un conflicto concurrente de Prisma P2034 en error de negocio 409", async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Transaction conflict",
      {
        code: "P2034",
        clientVersion: "5.22.0",
      }
    );

    vi.mocked(prisma.$transaction).mockRejectedValue(error);

    await expect(
      actualizarRolUsuario(
        "admin-1",
        "admin-2",
        "CLIENTE"
      )
    ).rejects.toMatchObject({
      message:
        "Otro cambio de roles ocurrió al mismo tiempo. Intenta de nuevo.",
      estado: 409,
    });
  });

  // =========================================================
  // PERFIL
  // =========================================================

  it("PF-AUTH-19: obtiene el perfil de un usuario existente", async () => {
    const perfil = {
      id: "usuario-1",
      nombre: "Mauro",
      email: "mauro@test.com",
      telefono: "999999999",
      direccion: "Lima",
      rol: "CLIENTE",
      creadoEn: new Date(),
      tallaRopa: "M",
      tallaCalzado: "42",
    };

    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      perfil as any
    );

    const resultado = await obtenerPerfilUsuario("usuario-1");

    expect(resultado).toEqual(perfil);
  });

  it("PF-AUTH-20: rechaza la consulta del perfil cuando el usuario no existe", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    await expect(
      obtenerPerfilUsuario("inexistente")
    ).rejects.toThrow("Usuario no encontrado");
  });

  it("PF-AUTH-21: actualiza nombre, teléfono y dirección del perfil", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    vi.mocked(prisma.usuario.update).mockResolvedValue({
      ...usuarioBase,
      nombre: "Mauro Actualizado",
      telefono: "988888888",
      direccion: "Nueva dirección",
    } as any);

    const resultado = await actualizarPerfil("usuario-1", {
      nombre: "Mauro Actualizado",
      telefono: "988888888",
      direccion: "Nueva dirección",
    });

    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "usuario-1",
        },
        data: {
          nombre: "Mauro Actualizado",
          telefono: "988888888",
          direccion: "Nueva dirección",
        },
      })
    );

    expect(resultado.nombre).toBe("Mauro Actualizado");
  });

  it("PF-AUTH-22: rechaza la actualización del perfil de un usuario inexistente", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    await expect(
      actualizarPerfil("inexistente", {
        nombre: "Mauro",
        telefono: "999999999",
        direccion: "Lima",
      })
    ).rejects.toThrow("Usuario no encontrado");

    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  // =========================================================
  // TALLAS
  // =========================================================

  it("PF-AUTH-23: actualiza las tallas del usuario", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: "usuario-1",
    } as any);

    vi.mocked(prisma.usuario.update).mockResolvedValue({
      ...usuarioBase,
      tallaRopa: "L",
      tallaCalzado: "43",
    } as any);

    const resultado = await actualizarTallas("usuario-1", {
      tallaRopa: "L",
      tallaCalzado: "43",
    });

    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "usuario-1",
        },
        data: {
          tallaRopa: "L",
          tallaCalzado: "43",
        },
      })
    );

    expect(resultado.tallaRopa).toBe("L");
    expect(resultado.tallaCalzado).toBe("43");
  });

  it("PF-AUTH-24: permite limpiar las tallas enviando cadenas vacías", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: "usuario-1",
    } as any);

    vi.mocked(prisma.usuario.update).mockResolvedValue({
      ...usuarioBase,
      tallaRopa: null,
      tallaCalzado: null,
    } as any);

    await actualizarTallas("usuario-1", {
      tallaRopa: "",
      tallaCalzado: "",
    });

    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tallaRopa: null,
          tallaCalzado: null,
        },
      })
    );
  });

  it("PF-AUTH-25: rechaza la actualización de tallas si el usuario no existe", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    await expect(
      actualizarTallas("inexistente", {
        tallaRopa: "M",
        tallaCalzado: "42",
      })
    ).rejects.toThrow("Usuario no encontrado");

    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  // =========================================================
  // CAMBIO DE CONTRASEÑA
  // =========================================================

  it("PF-AUTH-26: cambia la contraseña, revoca sesiones anteriores y genera nuevos tokens", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue(
      "nuevo-hash" as never
    );

    vi.mocked(prisma.usuario.update).mockReturnValue(
      Promise.resolve(usuarioBase) as any
    );

    vi.mocked(prisma.sesionActiva.deleteMany).mockReturnValue(
      Promise.resolve({ count: 2 }) as any
    );

    vi.mocked(prisma.$transaction).mockResolvedValue([
      usuarioBase,
      { count: 2 },
    ] as any);

    const resultado = await cambiarPassword(
      "usuario-1",
      "PasswordActual#123",
      "PasswordNueva#123"
    );

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "PasswordActual#123",
      "hash-password"
    );

    expect(bcrypt.hash).toHaveBeenCalledWith(
      "PasswordNueva#123",
      10
    );

    expect(prisma.$transaction).toHaveBeenCalled();

    expect(resultado).toHaveProperty("accessToken");
    expect(resultado).toHaveProperty("refreshToken");
  });

  it("PF-AUTH-27: rechaza el cambio de contraseña si el usuario no existe", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    await expect(
      cambiarPassword(
        "inexistente",
        "PasswordActual#123",
        "PasswordNueva#123"
      )
    ).rejects.toThrow("Usuario no encontrado");
  });

  it("PF-AUTH-28: rechaza el cambio cuando la contraseña actual es incorrecta", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      usuarioBase as any
    );

    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      cambiarPassword(
        "usuario-1",
        "PasswordIncorrecta#123",
        "PasswordNueva#123"
      )
    ).rejects.toThrow("La contraseña actual es incorrecta");

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});