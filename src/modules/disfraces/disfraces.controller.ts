import { Request, Response } from "express";
import { crearDisfrazSchema } from "./disfraces.schema";
import {
  crearDisfraz,
  listarDisfraces,
  obtenerTemporadasDisponibles,
  obtenerTiposDisponibles,
} from "./disfraces.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearDisfrazSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  const disfraz = await crearDisfraz(parseo.data);
  return res.status(201).json(disfraz);
}

function comaLista(valor: unknown): string[] | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  return valor.split(",").map((v) => v.trim()).filter(Boolean);
}

export async function listar(req: Request, res: Response) {
  const { nombre, temporadas, tipos } = req.query;
  const disfraces = await listarDisfraces({
    nombre: typeof nombre === "string" ? nombre : undefined,
    temporadas: comaLista(temporadas),
    tipos: comaLista(tipos),
  });
  return res.json(disfraces);
}

export async function temporadas(_req: Request, res: Response) {
  return res.json(await obtenerTemporadasDisponibles());
}

export async function tipos(_req: Request, res: Response) {
  return res.json(await obtenerTiposDisponibles());
}