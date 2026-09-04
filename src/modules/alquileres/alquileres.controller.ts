import { Request, Response } from "express";
import { crearAlquilerSchema } from "./alquileres.schema";
import { crearAlquiler, listarPropios, listarTodos, eliminarAlquiler, resumenAdmin } from "./alquileres.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearAlquilerSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  const alquiler = await crearAlquiler(parseo.data, req.usuario!.id);
  return res.status(201).json(alquiler);
}

export async function misAlquileres(req: Request, res: Response) {
  const alquileres = await listarPropios(req.usuario!.id);
  return res.json(alquileres);
}

export async function todos(_req: Request, res: Response) {
  const alquileres = await listarTodos();
  return res.json(alquileres);
}

export async function eliminar(req: Request, res: Response) {
  const resultado = await eliminarAlquiler(req.params.id, req.usuario!.id);
  if (resultado.count === 0) {
    return res.status(404).json({ mensaje: "Alquiler no encontrado" });
  }
  return res.status(204).send();
}

export async function resumen(_req: Request, res: Response) {
  const datos = await resumenAdmin();
  return res.json(datos);
}