import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: string;
        rol: string;
      };
    }
  }
}

export async function verificarToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // El access token se mantiene únicamente en memoria en el frontend
  // y se envía mediante Authorization: Bearer <token>.
  const encabezado = req.headers.authorization;

  if (!encabezado || !encabezado.startsWith("Bearer ")) {
    return res.status(401).json({
      mensaje: "Token no proporcionado",
    });
  }

  const token = encabezado.split(" ")[1];

  let payload: {
    sub: string;
    rol: string;
    jti?: string;
  };

  try {
    payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      rol: string;
      jti?: string;
    };
  } catch {
    return res.status(401).json({
      mensaje: "Token inválido o expirado",
    });
  }

  // Todos los access tokens actuales deben estar asociados
  // a una sesión mediante jti.
  if (!payload.jti) {
    return res.status(401).json({
      mensaje: "Token inválido. Vuelve a iniciar sesión.",
    });
  }

  // Comprueba que la sesión siga activa y obtiene
  // el rol ACTUAL del usuario desde la base de datos.
  const sesion = await prisma.sesionActiva.findUnique({
    where: {
      tokenId: payload.jti,
    },
    include: {
      usuario: {
        select: {
          rol: true,
        },
      },
    },
  });

  // Si la sesión fue eliminada por logout o cambio de contraseña,
  // el access token deja de ser válido inmediatamente.
  if (!sesion || sesion.usuarioId !== payload.sub) {
    return res.status(401).json({
      mensaje:
        "Esta sesión fue cerrada. Vuelve a iniciar sesión.",
    });
  }

  // Se utiliza el rol vigente en PostgreSQL,
  // no el rol almacenado originalmente en el JWT.
  req.usuario = {
    id: payload.sub,
    rol: sesion.usuario.rol,
  };

  next();
}

export function requiereRol(...rolesPermitidos: string[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (
      !req.usuario ||
      !rolesPermitidos.includes(req.usuario.rol)
    ) {
      return res.status(403).json({
        mensaje: "No tienes permisos para esta acción",
      });
    }

    next();
  };
}