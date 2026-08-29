import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { RegistroInput, LoginInput } from "./auth.schema";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

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
      rol: "CLIENTE",
    },
  });

  const token = generarToken(usuario.id, usuario.rol);
  return { usuario: sinPassword(usuario), token };
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

  const token = generarToken(usuario.id, usuario.rol);
  return { usuario: sinPassword(usuario), token };
}

function generarToken(usuarioId: string, rol: string) {
  return jwt.sign({ sub: usuarioId, rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

// Nunca devolver el hash de la contraseña al cliente
function sinPassword(usuario: { password: string; [key: string]: any }) {
  const { password, ...resto } = usuario;
  return resto;
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