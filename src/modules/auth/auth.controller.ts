import { Request, Response } from "express";
import { registroSchema, loginSchema, actualizarRolSchema } from "./auth.schema";
import {
  registrarUsuario,
  iniciarSesion,
  refrescarAccessToken,
  cerrarSesionesUsuario,
  listarUsuarios,
  actualizarRolUsuario,
  obtenerPerfilUsuario,
} from "./auth.service";
import { registrarEventoSeguridad } from "../../common/logger";

const esProduccion = process.env.NODE_ENV === "production";

const opcionesCookieRefresh = {
  httpOnly: true,
  secure: esProduccion,
  sameSite: esProduccion ? "none" as const : "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
};

export async function registro(req: Request, res: Response) {
  const parseo = registroSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  try {
    const resultado = await registrarUsuario(parseo.data);
    registrarEventoSeguridad({
      evento: "REGISTRO_EXITOSO",
      usuarioId: resultado.usuario.id,
      email: resultado.usuario.email,
      ip: req.ip,
    });
    res.cookie(
      "refreshToken",
      resultado.refreshToken,
      opcionesCookieRefresh
    );

    return res.status(201).json({
      usuario: resultado.usuario,
      accessToken: resultado.accessToken,
    });
  } catch (error: any) {
    registrarEventoSeguridad({ evento: "REGISTRO_FALLIDO", email: parseo.data.email, ip: req.ip, detalle: error.message });
    return res.status(400).json({ mensaje: error.message });
  }
}

export async function login(req: Request, res: Response) {
  const parseo = loginSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  try {
    const resultado = await iniciarSesion(parseo.data);

    registrarEventoSeguridad({
      evento: "LOGIN_EXITOSO",
      usuarioId: resultado.usuario.id,
      email: resultado.usuario.email,
      ip: req.ip,
    });

    res.cookie(
      "refreshToken",
      resultado.refreshToken,
      opcionesCookieRefresh
    );

    return res.status(200).json({
      usuario: resultado.usuario,
      accessToken: resultado.accessToken,
    });
  } catch (error: any) {
    registrarEventoSeguridad({ evento: "LOGIN_FALLIDO", email: parseo.data.email, ip: req.ip });
    return res.status(401).json({ mensaje: error.message });
  }
}

export async function refrescar(req: Request, res: Response) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken || typeof refreshToken !== "string") {
    return res.status(401).json({ mensaje: "Refresh token no proporcionado" });
  }

  try {
    const resultado = await refrescarAccessToken(refreshToken);
    return res.json(resultado);
  } catch (error: any) {
    return res.status(401).json({ mensaje: error.message });
  }
}

export async function logout(req: Request, res: Response) {
  await cerrarSesionesUsuario(req.usuario!.id);

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: esProduccion,
    sameSite: esProduccion ? "none" : "lax",
  });

  registrarEventoSeguridad({
    evento: "LOGOUT_TODAS_LAS_SESIONES",
    usuarioId: req.usuario!.id,
    ip: req.ip,
  });

  return res.json({ mensaje: "Sesión cerrada en todos los dispositivos" });
}

export async function listarUsuariosController(_req: Request, res: Response) {
  const usuarios = await listarUsuarios();
  return res.json(usuarios);
}

export async function actualizarRolController(req: Request, res: Response) {
  const parseo = actualizarRolSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  try {
    const usuario = await actualizarRolUsuario(req.params.id, parseo.data.rol);
    return res.json(usuario);
  } catch (error: any) {
    return res.status(404).json({ mensaje: error.message });
  }
}

export async function perfil(req: Request, res: Response) {
  try {
    const usuario = await obtenerPerfilUsuario(req.usuario!.id);

    return res.json({ usuario });
  } catch (error: any) {
    return res.status(404).json({ mensaje: error.message });
  }
}