import { Request, Response } from "express";
import { crearAlquilerSchema } from "./alquileres.schema";
import { crearAlquiler, listarPropios, listarTodos, resumenAdmin } from "./alquileres.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearAlquilerSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  const alquiler = await crearAlquiler(parseo.data, req.usuario!.id);
  return res.status(201).json(alquiler);
}

export async function misAlquileres(req: Request, res: Response) {
  return res.json(await listarPropios(req.usuario!.id));
}

export async function todos(_req: Request, res: Response) {
  return res.json(await listarTodos());
}

export async function resumen(_req: Request, res: Response) {
  return res.json(await resumenAdmin());
}