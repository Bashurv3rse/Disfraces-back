import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;

declare global {
  namespace Express {
    interface Request {
      usuario?: { id: string; rol: string };
    }
  }
}

export async function verificarToken(req: Request, res: Response, next: NextFunction) {
  const encabezado = req.headers.authorization;
  if (!encabezado || !encabezado.startsWith("Bearer ")) {
    return res.status(401).json({ mensaje: "Token no proporcionado" });
  }

  const token = encabezado.split(" ")[1];

  let payload: { sub: string; rol: string; jti?: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { sub: string; rol: string; jti?: string };
  } catch {
    return res.status(401).json({ mensaje: "Token inválido o expirado" });
  }

  // Revocación instantánea: si la sesión ya no existe (logout en cualquier
  // dispositivo), el access token deja de servir de inmediato, aunque su
  // firma y su expiración natural sigan siendo válidas.
  if (payload.jti) {
    const sesion = await prisma.sesionActiva.findUnique({ where: { tokenId: payload.jti } });
    if (!sesion || sesion.usuarioId !== payload.sub) {
      return res.status(401).json({ mensaje: "Esta sesión fue cerrada. Vuelve a iniciar sesión." });
    }
  }

  req.usuario = { id: payload.sub, rol: payload.rol };
  next();
}

export function requiereRol(...rolesPermitidos: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: "No tienes permisos para esta acción" });
    }
    next();
  };
}