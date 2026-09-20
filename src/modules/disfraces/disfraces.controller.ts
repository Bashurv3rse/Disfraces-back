import { Request, Response } from "express";
import {
  crearDisfrazSchema,
  actualizarEstadoManualSchema,
  actualizarPrendaSchema,
  confirmarPrestamoSchema,
} from "./disfraces.schema";
import {
  crearDisfraz,
  listarDisfraces,
  obtenerDisfrazConEstado,
  obtenerTemporadasDisponibles,
  obtenerTiposDisponibles,
  actualizarEstadoManual,
  actualizarPrenda,
  buscarCandidatos,
  confirmarPrestamo,
} from "./disfraces.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearDisfrazSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
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

export async function obtenerUno(req: Request, res: Response) {
  const disfraz = await obtenerDisfrazConEstado(req.params.id);
  if (!disfraz) return res.status(404).json({ mensaje: "Disfraz no encontrado" });
  return res.json(disfraz);
}

export async function temporadas(_req: Request, res: Response) {
  return res.json(await obtenerTemporadasDisponibles());
}

export async function tipos(_req: Request, res: Response) {
  return res.json(await obtenerTiposDisponibles());
}

export async function actualizarEstado(req: Request, res: Response) {
  const parseo = actualizarEstadoManualSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  await actualizarEstadoManual(req.params.id, parseo.data.estado);
  return res.json(await obtenerDisfrazConEstado(req.params.id));
}

export async function editarPrenda(req: Request, res: Response) {
  const parseo = actualizarPrendaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  const prenda = await actualizarPrenda(req.params.prendaId, parseo.data);
  return res.json(prenda);
}

export async function candidatosPrenda(req: Request, res: Response) {
  try {
    return res.json(await buscarCandidatos(req.params.prendaId));
  } catch (error: any) {
    return res.status(404).json({ mensaje: error.message });
  }
}

export async function prestamoPrenda(req: Request, res: Response) {
  const parseo = confirmarPrestamoSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  try {
    const donante = await confirmarPrestamo(req.params.prendaId, parseo.data.prendaDonanteId);
    return res.status(201).json(donante);
  } catch (error: any) {
    return res.status(404).json({ mensaje: error.message });
  }
}