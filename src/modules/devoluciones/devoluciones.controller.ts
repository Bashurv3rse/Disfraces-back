import { Request, Response } from "express";
import { crearDevolucionSchema } from "./devoluciones.schema";
import { crearDevolucion, listarDevoluciones } from "./devoluciones.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearDevolucionSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  try {
    const resultado = await crearDevolucion(parseo.data, req.usuario!.id);
    return res.status(201).json(resultado);
  } catch (error: any) {
    return res.status(404).json({ mensaje: error.message });
  }
}

export async function listar(_req: Request, res: Response) {
  return res.json(await listarDevoluciones());
}