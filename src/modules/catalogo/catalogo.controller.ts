import { Request, Response } from "express";
import { crearPiezaSchema, actualizarStockSchema } from "./catalogo.schema";
import {
  crearPieza,
  listarPiezas,
  obtenerPiezaPorId,
  actualizarStock,
  obtenerTemporadasDisponibles,
} from "./catalogo.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearPiezaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  const pieza = await crearPieza(parseo.data);
  return res.status(201).json(pieza);
}

function comaLista(valor: unknown): string[] | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  return valor.split(",").map((v) => v.trim()).filter(Boolean);
}

export async function listar(req: Request, res: Response) {
  const { nombre, tipos, temporadas, colores } = req.query;

  const piezas = await listarPiezas({
    nombre: typeof nombre === "string" ? nombre : undefined,
    tipos: comaLista(tipos),
    temporadas: comaLista(temporadas),
    colores: comaLista(colores),
  });

  return res.json(piezas);
}

export async function temporadas(_req: Request, res: Response) {
  const lista = await obtenerTemporadasDisponibles();
  return res.json(lista);
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