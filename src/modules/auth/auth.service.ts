import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { RegistroInput, LoginInput } from "./auth.schema";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

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

  const tokens = generarTokens(usuario.id, usuario.rol);
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

  const tokens = generarTokens(usuario.id, usuario.rol);
  return { usuario: sinPassword(usuario), ...tokens };
}

// Renueva el access token a partir de un refresh token válido — el cliente nunca
// vuelve a pedir usuario/contraseña mientras el refresh siga vigente (7 días).
export async function refrescarAccessToken(refreshToken: string) {
  let payload: { sub: string; rol: string };
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { sub: string; rol: string };
  } catch {
    throw new Error("Refresh token inválido o expirado");
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  // El rol se vuelve a leer de la BD (no del token viejo), por si cambió mientras tanto.
  const accessToken = jwt.sign({ sub: usuario.id, rol: usuario.rol }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  return { accessToken };
}

function generarTokens(usuarioId: string, rol: string) {
  const accessToken = jwt.sign({ sub: usuarioId, rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  const refreshToken = jwt.sign({ sub: usuarioId, rol }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
  return { accessToken, refreshToken };
}

export function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, nombre: true, email: true, rol: true, creadoEn: true },
    orderBy: { creadoEn: "desc" },
  });
}

export async function actualizarRolUsuario(id: string, rol: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  return prisma.usuario.update({
    where: { id },
    data: { rol: rol as any },
    select: { id: true, nombre: true, email: true, rol: true, creadoEn: true },
  });
}

function sinPassword(usuario: { password: string; [key: string]: any }) {
  const { password, ...resto } = usuario;
  return resto;
}