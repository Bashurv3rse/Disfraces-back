import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../../src/config/prisma";
import {
  actualizarPerfil,
  actualizarTallas,
  cambiarPassword,
  iniciarSesion,
  refrescarAccessToken,
} from "../../src/modules/auth/auth.service";

const EMAIL = `integracion-perfil-${Date.now()}@test.com`;

const PASSWORD_INICIAL = "Prueba123!";
const PASSWORD_NUEVA = "Nueva456!";

let usuarioId: string;

describe("Integración - Perfil, contraseña y PostgreSQL", () => {
  beforeAll(async () => {
    // Protección adicional para evitar ejecutar este archivo
    // accidentalmente contra una BD que no sea la de pruebas.
    if (process.env.NODE_ENV !== "test") {
      throw new Error(
        "Las pruebas de integración solo pueden ejecutarse con NODE_ENV=test."
      );
    }

    const databaseUrl =
      process.env.DATABASE_URL ?? "";

    if (
      !databaseUrl.includes(
        "disfraz_test_db"
      )
    ) {
      throw new Error(
        "DATABASE_URL no apunta a disfraz_test_db. Prueba cancelada por seguridad."
      );
    }

    const passwordHasheada =
      await bcrypt.hash(
        PASSWORD_INICIAL,
        10
      );

    const usuario =
      await prisma.usuario.create({
        data: {
          nombre: "Usuario Integración",
          email: EMAIL,
          password: passwordHasheada,
          telefono: "999111222",
          direccion: "Dirección inicial",
          rol: "CLIENTE",
          tallaRopa: "M",
          tallaCalzado: "40",
        },
      });

    usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (usuarioId) {
      await prisma.sesionActiva.deleteMany({
        where: {
          usuarioId,
        },
      });

      await prisma.usuario.deleteMany({
        where: {
          id: usuarioId,
        },
      });
    }

    await prisma.$disconnect();
  });

  it("PI-17: actualiza el perfil y persiste los cambios realmente en PostgreSQL", async () => {
    const resultado =
      await actualizarPerfil(
        usuarioId,
        {
          nombre:
            "Usuario Integración Actualizado",
          telefono: "987654321",
          direccion:
            "Nueva dirección de prueba",
        }
      );

    expect(resultado).toEqual(
      expect.objectContaining({
        id: usuarioId,
        nombre:
          "Usuario Integración Actualizado",
        email: EMAIL,
        telefono: "987654321",
        direccion:
          "Nueva dirección de prueba",
        rol: "CLIENTE",
      })
    );

    // Comprobación directa contra PostgreSQL.
    const guardado =
      await prisma.usuario.findUnique({
        where: {
          id: usuarioId,
        },
      });

    expect(guardado).not.toBeNull();

    expect(guardado?.nombre).toBe(
      "Usuario Integración Actualizado"
    );

    expect(guardado?.telefono).toBe(
      "987654321"
    );

    expect(guardado?.direccion).toBe(
      "Nueva dirección de prueba"
    );

    // El email no debe cambiar mediante
    // actualizarPerfil().
    expect(guardado?.email).toBe(EMAIL);
  });

  it("PI-18: cambiar la contraseña persiste el nuevo hash, revoca la sesión anterior y crea una nueva", async () => {
    // 1. Iniciamos sesión normalmente.
    const sesionAnterior =
      await iniciarSesion({
        email: EMAIL,
        password: PASSWORD_INICIAL,
      });

    const payloadAnterior =
      jwt.decode(
        sesionAnterior.accessToken
      ) as {
        sub: string;
        rol: string;
        jti: string;
      };

    expect(payloadAnterior.sub).toBe(
      usuarioId
    );

    const sesionBDAnterior =
      await prisma.sesionActiva.findUnique({
        where: {
          tokenId:
            payloadAnterior.jti,
        },
      });

    expect(
      sesionBDAnterior
    ).not.toBeNull();

    // 2. Cambiamos la contraseña.
    const nuevosTokens =
      await cambiarPassword(
        usuarioId,
        PASSWORD_INICIAL,
        PASSWORD_NUEVA
      );

    expect(
      nuevosTokens.accessToken
    ).toBeTruthy();

    expect(
      nuevosTokens.refreshToken
    ).toBeTruthy();

    // 3. La contraseña almacenada debe ser
    // ahora el hash de la nueva contraseña.
    const usuarioActualizado =
      await prisma.usuario.findUnique({
        where: {
          id: usuarioId,
        },
      });

    expect(
      usuarioActualizado
    ).not.toBeNull();

    expect(
      await bcrypt.compare(
        PASSWORD_NUEVA,
        usuarioActualizado!.password
      )
    ).toBe(true);

    expect(
      await bcrypt.compare(
        PASSWORD_INICIAL,
        usuarioActualizado!.password
      )
    ).toBe(false);

    // 4. La sesión anterior debe haber sido
    // eliminada de PostgreSQL.
    const sesionViejaDespues =
      await prisma.sesionActiva.findUnique({
        where: {
          tokenId:
            payloadAnterior.jti,
        },
      });

    expect(
      sesionViejaDespues
    ).toBeNull();

    // 5. Intentar refrescar usando el refresh
    // token anterior debe fallar.
    await expect(
      refrescarAccessToken(
        sesionAnterior.refreshToken
      )
    ).rejects.toThrow(
      "Esta sesión fue cerrada. Vuelve a iniciar sesión."
    );

    // 6. cambiarPassword() debe haber creado
    // una nueva sesión válida.
    const payloadNuevo =
      jwt.decode(
        nuevosTokens.accessToken
      ) as {
        sub: string;
        rol: string;
        jti: string;
      };

    expect(payloadNuevo.sub).toBe(
      usuarioId
    );

    expect(payloadNuevo.jti).not.toBe(
      payloadAnterior.jti
    );

    const nuevaSesionBD =
      await prisma.sesionActiva.findUnique({
        where: {
          tokenId: payloadNuevo.jti,
        },
      });

    expect(nuevaSesionBD).not.toBeNull();

    expect(
      nuevaSesionBD?.usuarioId
    ).toBe(usuarioId);

    // 7. La nueva contraseña permite iniciar
    // sesión normalmente.
    const loginNuevo =
      await iniciarSesion({
        email: EMAIL,
        password: PASSWORD_NUEVA,
      });

    expect(loginNuevo.usuario.id).toBe(
      usuarioId
    );

    expect(
      loginNuevo.accessToken
    ).toBeTruthy();
  });

  it("PI-19: actualiza las tallas del usuario y persiste los valores en PostgreSQL", async () => {
    const resultado =
      await actualizarTallas(
        usuarioId,
        {
          tallaRopa: "L",
          tallaCalzado: "42",
        }
      );

    expect(resultado.tallaRopa).toBe(
      "L"
    );

    expect(
      resultado.tallaCalzado
    ).toBe("42");

    const guardado =
      await prisma.usuario.findUnique({
        where: {
          id: usuarioId,
        },
        select: {
          tallaRopa: true,
          tallaCalzado: true,
        },
      });

    expect(guardado).toEqual({
      tallaRopa: "L",
      tallaCalzado: "42",
    });
  });
});