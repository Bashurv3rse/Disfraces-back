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
  disponibilidadDeDisfraces,
  listarATemporales,
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
import { ErrorHistorial, obtenerHistorialDisfraz } from "./historial.service";
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

function parsearRango(inicio: unknown, fin: unknown): { inicio: Date; fin: Date } | "invalido" | null {
  if (inicio === undefined && fin === undefined) return null;
  if (typeof inicio !== "string" || typeof fin !== "string") return "invalido";
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(inicio) || !re.test(fin)) return "invalido";
  const i = new Date(`${inicio}T00:00:00.000Z`);
  const f = new Date(`${fin}T00:00:00.000Z`);
  if (Number.isNaN(i.getTime()) || Number.isNaN(f.getTime()) || f < i) return "invalido";
  return { inicio: i, fin: f };
}

export async function listar(req: Request, res: Response) {
  const { nombre, temporadas, tipos, inicio, fin } = req.query;
  const filtros = {
    nombre: typeof nombre === "string" ? nombre : undefined,
    temporadas: comaLista(temporadas),
    tipos: comaLista(tipos),
  };

  // Con «inicio» y «fin» (AAAA-MM-DD) cada disfraz trae su disponibilidad para esas fechas.
  // Sin ellas la respuesta es la de siempre, más la disponibilidad de hoy.
  const rango = parsearRango(inicio, fin);
  if (rango === "invalido") return res.status(400).json({ mensaje: "Fechas inválidas: usa inicio y fin (AAAA-MM-DD) con fin posterior o igual al inicio." });
  const disfraces = await listarDisfraces(filtros, { conDisponibilidad: true, rango: rango ?? undefined });
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

export async function aMedidaTemporales(_req: Request, res: Response) {
  return res.json(await listarATemporales());
}

// Disponibilidad de varios disfraces en un rango: ?ids=a,b&inicio=AAAA-MM-DD&fin=AAAA-MM-DD
export async function disponibilidad(req: Request, res: Response) {
  const ids = comaLista(req.query.ids);
  const rango = parsearRango(req.query.inicio, req.query.fin);
  if (!ids || ids.length === 0 || ids.length > 50 || !rango || rango === "invalido") {
    return res.status(400).json({ mensaje: "Indica los disfraces (ids) y un rango de fechas válido (inicio y fin)." });
  }
  return res.json(await disponibilidadDeDisfraces(ids, rango));
}

export async function historial(req: Request, res: Response) {
  try {
    const resultado = await obtenerHistorialDisfraz(req.params.id);
    if (!resultado) return res.status(404).json({ mensaje: "Disfraz no encontrado" });
    return res.json(resultado);
  } catch (error) {
    if (error instanceof ErrorHistorial) return res.status(error.estado).json({ mensaje: error.message });
    return res.status(500).json({ mensaje: "No se pudo obtener el historial" });
  }
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
    await actualizarEstadoManual(req.params.id, parseo.data.estado, req.usuario?.id);
    return res.json(await obtenerDisfrazConEstado(req.params.id));
  } catch (error: any) {
    return res.status(409).json({ mensaje: error.message });
  }
}

export async function editarPrenda(req: Request, res: Response) {
  const parseo = actualizarPrendaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  try {
    const prenda = await actualizarPrenda(req.params.prendaId, parseo.data, req.usuario?.id);
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
