import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Prisma, Rol } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  RegistroInput,
  LoginInput,
  ActualizarPerfilInput,
} from "./auth.schema";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

// Error de regla de negocio, con el código HTTP que debe devolver el controller.
export class ErrorNegocio extends Error {
  constructor(
    mensaje: string,
    public readonly estado: number
  ) {
    super(mensaje);
  }
}

const CAMPOS_PERFIL = {
  id: true,
  nombre: true,
  email: true,
  telefono: true,
  direccion: true,
  rol: true,
  creadoEn: true,
} as const;

function calcularExpiracion(duracion: string): Date {
  const coincidencia = /^(\d+)([smhd])$/.exec(duracion);
  const ahora = Date.now();
  if (!coincidencia) return new Date(ahora + 7 * 24 * 60 * 60 * 1000); // respaldo: 7 días
  const cantidad = Number(coincidencia[1]);
  const unidad = coincidencia[2];
  const factorMs: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return new Date(ahora + cantidad * factorMs[unidad]);
}

export async function registrarUsuario(datos: RegistroInput) {
  const existente = await prisma.usuario.findUnique({ where: { email: datos.email } });
  if (existente) {
    throw new Error("Ya existe un usuario registrado con ese email");
  }

  const passwordHasheada = await bcrypt.hash(datos.password, 10);

  const usuario = await prisma.usuario.create({
    data: {
      nombre: datos.nombre,
      email: datos.email,
      password: passwordHasheada,
      telefono: datos.telefono,
      direccion: datos.direccion,
      rol: "CLIENTE",
    },
  });

  const tokens = await generarTokens(usuario.id, usuario.rol);
  return { usuario: sinPassword(usuario), ...tokens };
}

export async function iniciarSesion(datos: LoginInput) {
  const usuario = await prisma.usuario.findUnique({ where: { email: datos.email } });
  if (!usuario) {
    throw new Error("Credenciales inválidas");
  }

  const passwordValida = await bcrypt.compare(datos.password, usuario.password);
  if (!passwordValida) {
    throw new Error("Credenciales inválidas");
  }

  const tokens = await generarTokens(usuario.id, usuario.rol);
  return { usuario: sinPassword(usuario), ...tokens };
}

// Renueva el access token — ahora exige que la sesión (identificada por el jti
// del refresh token) siga registrada como activa; si fue revocada (logout desde
// cualquier dispositivo), se rechaza aunque la firma del JWT siga siendo válida.
export async function refrescarAccessToken(refreshToken: string) {
  let payload: { sub: string; rol: string; jti: string };
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { sub: string; rol: string; jti: string };
  } catch {
    throw new Error("Refresh token inválido o expirado");
  }

  const sesion = await prisma.sesionActiva.findUnique({ where: { tokenId: payload.jti } });
  if (!sesion || sesion.usuarioId !== payload.sub) {
    throw new Error("Esta sesión fue cerrada. Vuelve a iniciar sesión.");
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  const accessToken = jwt.sign(
    {
      sub: usuario.id,
      rol: usuario.rol,
      jti: payload.jti,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions
  );

  return { accessToken };
}

// Cierra TODAS las sesiones del usuario (todos los dispositivos/navegadores a
// la vez) — es la semántica que se pidió: cerrar una cierra todas.
export async function cerrarSesionesUsuario(usuarioId: string) {
  await prisma.sesionActiva.deleteMany({ where: { usuarioId } });
}

async function generarTokens(usuarioId: string, rol: string) {
  // Mismo jti en ambos tokens: así el access token también puede verificarse
  // contra la misma fila de SesionActiva, no solo el refresh.
  const jti = randomUUID();

  const accessToken = jwt.sign({ sub: usuarioId, rol, jti }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign({ sub: usuarioId, rol, jti }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);

  await prisma.sesionActiva.create({
    data: { usuarioId, tokenId: jti, expiraEn: calcularExpiracion(JWT_REFRESH_EXPIRES_IN) },
  });

  return { accessToken, refreshToken };
}

export function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, creadoEn: true },
    orderBy: { creadoEn: "desc" },
  });
}

// Reglas: nadie cambia su propio rol, y el sistema nunca se queda sin administradores.
// La comprobación y el cambio van en una transacción serializable: si dos
// administradores se degradan mutuamente al mismo tiempo, uno de los dos falla en vez
// de dejar el sistema sin ninguno.
export async function actualizarRolUsuario(
  solicitanteId: string,
  id: string,
  rol: Rol
) {
  if (solicitanteId === id) {
    throw new ErrorNegocio(
      "No puedes cambiar tu propio rol.",
      403
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const usuario = await tx.usuario.findUnique({
          where: { id },
        });

        if (!usuario) {
          throw new ErrorNegocio(
            "Usuario no encontrado",
            404
          );
        }

        if (
          usuario.rol === "ADMINISTRADOR" &&
          rol !== "ADMINISTRADOR"
        ) {
          const admins = await tx.usuario.count({
            where: {
              rol: "ADMINISTRADOR",
            },
          });

          if (admins <= 1) {
            throw new ErrorNegocio(
              "El sistema debe conservar al menos un administrador.",
              409
            );
          }
        }

        return tx.usuario.update({
          where: { id },
          data: { rol },
          select: {
            id: true,
            nombre: true,
            email: true,
            rol: true,
            creadoEn: true,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new ErrorNegocio(
        "Otro cambio de roles ocurrió al mismo tiempo. Intenta de nuevo.",
        409
      );
    }

    throw error;
  }
}

function sinPassword(usuario: { password: string; [key: string]: any }) {
  const { password, ...resto } = usuario;
  return resto;
}

export async function obtenerPerfilUsuario(id: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: CAMPOS_PERFIL,
  });

  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  return usuario;
}

export async function actualizarPerfil(
  id: string,
  datos: ActualizarPerfilInput
) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
  });

  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  return prisma.usuario.update({
    where: { id },
    data: {
      nombre: datos.nombre,
      telefono: datos.telefono,
      direccion: datos.direccion,
    },
    select: CAMPOS_PERFIL,
  });
}

export async function cambiarPassword(
  id: string,
  passwordActual: string,
  passwordNueva: string
) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
  });

  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  const coincide = await bcrypt.compare(
    passwordActual,
    usuario.password
  );

  if (!coincide) {
    throw new Error("La contraseña actual es incorrecta");
  }

  const passwordHasheada = await bcrypt.hash(passwordNueva, 10);

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id },
      data: {
        password: passwordHasheada,
      },
    }),

    prisma.sesionActiva.deleteMany({
      where: { usuarioId: id },
    }),
  ]);

  return generarTokens(usuario.id, usuario.rol);
}