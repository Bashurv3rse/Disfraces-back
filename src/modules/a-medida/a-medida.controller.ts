import { Request, Response } from "express";
import { buscarSchema, previsualizarSchema, reservarSchema } from "./a-medida.schema";
import { ErrorBusqueda, buscarRecetas, listarRecetasPublicas } from "./busqueda.service";
import { ErrorArmado } from "./armado.service";
import type { TallasPedido } from "./armado.service";
import { ErrorReserva, cancelarReserva } from "./reservas.service";
import { misReservas, previsualizar, reservar } from "./a-medida.service";
import { registrarEventoSeguridad } from "../../common/logger";

// Nunca se responde 401 desde aquí: el interceptor del frontend lo trataría como sesión vencida.
function responderError(error: unknown, res: Response) {
  if (error instanceof ErrorReserva) {
    const extra = typeof error.datos === "object" && error.datos ? (error.datos as Record<string, unknown>) : {};
    return res.status(error.estado).json({ mensaje: error.message, ...extra });
  }
  if (error instanceof ErrorArmado || error instanceof ErrorBusqueda) {
    return res.status(error.estado).json({ mensaje: error.message });
  }
  console.error(error);
  return res.status(500).json({ mensaje: "No se pudo completar la operación. Intenta de nuevo." });
}

export async function recetas(_req: Request, res: Response) {
  return res.json(await listarRecetasPublicas());
}

export async function buscar(req: Request, res: Response) {
  const parseo = buscarSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    return res.json(await buscarRecetas(req.usuario!.id, parseo.data.texto));
  } catch (error) {
    return responderError(error, res);
  }
}

export async function previsualizarController(req: Request, res: Response) {
  const parseo = previsualizarSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const tallas: TallasPedido = parseo.data.tallas ?? {};
    return res.json(await previsualizar(parseo.data.recetaId, tallas));
  } catch (error) {
    return responderError(error, res);
  }
}

export async function reservarController(req: Request, res: Response) {
  const parseo = reservarSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const tallas: TallasPedido = parseo.data.tallas ?? {};
    const { reserva, auditoria } = await reservar(req.usuario!.id, parseo.data.recetaId, tallas, parseo.data.peticion);
    registrarEventoSeguridad({ evento: "A_MEDIDA_RESERVADO", usuarioId: req.usuario!.id, ip: req.ip, detalle: auditoria });
    return res.status(201).json(reserva);
  } catch (error) {
    return responderError(error, res);
  }
}

export async function misReservasController(req: Request, res: Response) {
  try {
    return res.json(await misReservas(req.usuario!.id));
  } catch (error) {
    return responderError(error, res);
  }
}

export async function cancelarController(req: Request, res: Response) {
  try {
    await cancelarReserva(req.params.id, req.usuario!.id);
    registrarEventoSeguridad({ evento: "A_MEDIDA_CANCELADO", usuarioId: req.usuario!.id, ip: req.ip, detalle: req.params.id });
    return res.status(204).send();
  } catch (error) {
    return responderError(error, res);
  }
}