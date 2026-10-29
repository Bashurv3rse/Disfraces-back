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
  obtenerDetalleInventario,
  obtenerTemporadasDisponibles,
  obtenerTiposDisponibles,
  actualizarEstadoManual,
  actualizarPrenda,
  buscarCandidatos,
  confirmarPrestamo,
  ErrorDisfraz,
  devolverPrestamo,
} from "./disfraces.service";
import { registrarEventoSeguridad } from "../../common/logger";

export async function crear(req: Request, res: Response) {
  const parseo = crearDisfrazSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const disfraz = await crearDisfraz(parseo.data);
    registrarEventoSeguridad({
      evento: "DISFRAZ_CREADO",
      usuarioId: req.usuario!.id,
      ip: req.ip,
      detalle: parseo.data.nombre,
    });
    return res.status(201).json(disfraz);
  } catch (error) {
    if (error instanceof ErrorDisfraz) {
      return res.status(error.estado).json({ mensaje: error.message });
    }
    return res.status(500).json({ mensaje: "No se pudo crear el disfraz" });
  }
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

export async function detalleInventario(req: Request, res: Response) {
  const detalle = await obtenerDetalleInventario(req.params.id);
  if (!detalle) return res.status(404).json({ mensaje: "Disfraz no encontrado" });
  return res.json(detalle);
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
  try {
    await actualizarEstadoManual(req.params.id, parseo.data.estado);
    return res.json(await obtenerDisfrazConEstado(req.params.id));
  } catch (error: any) {
    return res.status(409).json({ mensaje: error.message });
  }
}

export async function editarPrenda(req: Request, res: Response) {
  const parseo = actualizarPrendaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  try {
    const prenda = await actualizarPrenda(req.params.prendaId, parseo.data);
    return res.json(prenda);
  } catch (error: any) {
    return res.status(409).json({ mensaje: error.message });
  }
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
    return res.status(409).json({ mensaje: error.message });
  }
}

export async function devolverPrestamoPrenda(req: Request, res: Response) {
  try {
    const prenda = await devolverPrestamo(req.params.prendaId);
    return res.json(prenda);
  } catch (error: any) {
    return res.status(409).json({ mensaje: error.message });
  }
}