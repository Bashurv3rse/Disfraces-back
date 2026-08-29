import { Request, Response } from "express";
import { crearPiezaSchema } from "./catalogo.schema";
import { crearPieza } from "./catalogo.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearPiezaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  const pieza = await crearPieza(parseo.data);
  return res.status(201).json(pieza);
}