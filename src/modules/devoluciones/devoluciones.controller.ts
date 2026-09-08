import { Request, Response } from "express";
import { crearDevolucionSchema, actualizarEstadoSchema } from "./devoluciones.schema";
import { crearDevolucion, listarDevoluciones, actualizarEstadoDevolucion } from "./devoluciones.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearDevolucionSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  try {
    const devolucion = await crearDevolucion(parseo.data, req.usuario!.id);
    return res.status(201).json(devolucion);
  } catch (error: any) {
    return res.status(404).json({ mensaje: error.message });
  }
}

export async function listar(_req: Request, res: Response) {
  const devoluciones = await listarDevoluciones();
  return res.json(devoluciones);
}

export async function actualizarEstado(req: Request, res: Response) {
  const parseo = actualizarEstadoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  const devolucion = await actualizarEstadoDevolucion(req.params.id, parseo.data.estado);
  return res.json(devolucion);
}