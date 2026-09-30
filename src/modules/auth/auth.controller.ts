import { Request, Response } from "express";
import { registroSchema, loginSchema, actualizarRolSchema } from "./auth.schema";
import {
  registrarUsuario,
  iniciarSesion,
  refrescarAccessToken,
  cerrarSesionesUsuario,
  listarUsuarios,
  actualizarRolUsuario,
} from "./auth.service";
import { registrarEventoSeguridad } from "../../common/logger";

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
    return res.status(201).json(resultado);
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
    return res.status(200).json(resultado);
  } catch (error: any) {
    registrarEventoSeguridad({ evento: "LOGIN_FALLIDO", email: parseo.data.email, ip: req.ip });
    return res.status(401).json({ mensaje: error.message });
  }
}

export async function refrescar(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken || typeof refreshToken !== "string") {
    return res.status(400).json({ mensaje: "Falta el refresh token" });
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
  registrarEventoSeguridad({ evento: "LOGOUT_TODAS_LAS_SESIONES", usuarioId: req.usuario!.id, ip: req.ip });
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