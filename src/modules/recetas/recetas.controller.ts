import { Request, Response } from "express";
import { recetaSchema, activarRecetaSchema } from "./recetas.schema";
import {
  listarRecetas,
  crearReceta,
  actualizarReceta,
  cambiarActiva,
  eliminarReceta,
  ErrorReceta,
} from "./recetas.service";
import { registrarEventoSeguridad } from "../../common/logger";

function responderError(error: unknown, res: Response) {
  if (error instanceof ErrorReceta) return res.status(error.estado).json({ mensaje: error.message });
  console.error(error);
  return res.status(500).json({ mensaje: "No se pudo completar la operación" });
}

export async function listar(_req: Request, res: Response) {
  return res.json(await listarRecetas());
}

export async function crear(req: Request, res: Response) {
  const parseo = recetaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const receta = await crearReceta(parseo.data);
    registrarEventoSeguridad({ evento: "RECETA_CREADA", usuarioId: req.usuario!.id, ip: req.ip, detalle: parseo.data.nombre });
    return res.status(201).json(receta);
  } catch (error) {
    return responderError(error, res);
  }
}

export async function actualizar(req: Request, res: Response) {
  const parseo = recetaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const receta = await actualizarReceta(req.params.id, parseo.data);
    registrarEventoSeguridad({ evento: "RECETA_ACTUALIZADA", usuarioId: req.usuario!.id, ip: req.ip, detalle: parseo.data.nombre });
    return res.json(receta);
  } catch (error) {
    return responderError(error, res);
  }
}

export async function activar(req: Request, res: Response) {
  const parseo = activarRecetaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    return res.json(await cambiarActiva(req.params.id, parseo.data.activa));
  } catch (error) {
    return responderError(error, res);
  }
}

export async function eliminar(req: Request, res: Response) {
  try {
    await eliminarReceta(req.params.id);
    registrarEventoSeguridad({ evento: "RECETA_ELIMINADA", usuarioId: req.usuario!.id, ip: req.ip, detalle: req.params.id });
    return res.status(204).send();
  } catch (error) {
    return responderError(error, res);
  }
}