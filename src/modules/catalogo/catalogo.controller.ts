import { Request, Response } from "express";
import { crearPiezaSchema } from "./catalogo.schema";
import { crearPieza } from "./catalogo.service";
import { actualizarStockSchema } from "./catalogo.schema";
import { listarPiezas, obtenerPiezaPorId, actualizarStock } from "./catalogo.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearPiezaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  const pieza = await crearPieza(parseo.data);
  return res.status(201).json(pieza);
}
export async function listar(_req: Request, res: Response) {
  const piezas = await listarPiezas();
  return res.json(piezas);
}

export async function actualizarStockController(req: Request, res: Response) {
  const parseo = actualizarStockSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  const pieza = await obtenerPiezaPorId(req.params.id);
  if (!pieza) {
    return res.status(404).json({ mensaje: "Pieza no encontrada" });
  }

  const actualizada = await actualizarStock(req.params.id, parseo.data.stock);
  return res.json(actualizada);
}