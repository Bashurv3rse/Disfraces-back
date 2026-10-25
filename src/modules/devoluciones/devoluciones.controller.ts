import { Request, Response } from "express";
import { z } from "zod";
import { crearDevolucionSchema, corregirPrendaSchema, resolverGarantiaSchema } from "./devoluciones.schema";
import { crearDevolucion, listarDevoluciones, ErrorDevolucion } from "./devoluciones.service";
import { ErrorGarantia, corregirEstadoPrenda, resolverGarantia } from "./garantia.service";
import { registrarEventoSeguridad } from "../../common/logger";

const idSchema = z.string().uuid();

export async function crear(req: Request, res: Response) {
  const parseo = crearDevolucionSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  try {
    const resultado = await crearDevolucion(parseo.data, req.usuario!.id);
    return res.status(201).json(resultado);
  } catch (error) {
    if (error instanceof ErrorDevolucion) return res.status(error.estado).json({ mensaje: error.message });
    console.error(error);
    return res.status(500).json({ mensaje: "No se pudo registrar la devolución. Intenta de nuevo." });
  }
}

export async function listar(_req: Request, res: Response) {
  return res.json(await listarDevoluciones());
}

function responderError(error: unknown, res: Response) {
  if (error instanceof ErrorGarantia) return res.status(error.estado).json({ mensaje: error.message });
  console.error(error);
  return res.status(500).json({ mensaje: "No se pudo completar la operación. Intenta de nuevo." });
}

export async function corregirPrenda(req: Request, res: Response) {
  const id = idSchema.safeParse(req.params.id);
  const prendaId = idSchema.safeParse(req.params.prendaId);
  if (!id.success || !prendaId.success) return res.status(400).json({ mensaje: "Identificador inválido" });

  const parseo = corregirPrendaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const devolucion = await corregirEstadoPrenda(id.data, prendaId.data, parseo.data.estado, parseo.data.observacion);
    registrarEventoSeguridad({
      evento: "DEVOLUCION_PRENDA_CORREGIDA",
      usuarioId: req.usuario!.id,
      ip: req.ip,
      detalle: `${id.data} / ${prendaId.data} → ${parseo.data.estado}`,
    });
    return res.json(devolucion);
  } catch (error) {
    return responderError(error, res);
  }
}

export async function resolver(req: Request, res: Response) {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ mensaje: "Identificador inválido" });

  const parseo = resolverGarantiaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const devolucion = await resolverGarantia(id.data, parseo.data.accion, parseo.data.motivo, req.usuario!.id);
    registrarEventoSeguridad({
      evento: parseo.data.accion === "DEVOLVER" ? "GARANTIA_DEVUELTA" : "GARANTIA_RETENIDA",
      usuarioId: req.usuario!.id,
      ip: req.ip,
      detalle: `${id.data} · S/ ${devolucion?.garantiaMonto} · reembolso ${devolucion?.garantiaReembolsoId ?? "ninguno"}`,
    });
    return res.json(devolucion);
  } catch (error) {
    return responderError(error, res);
  }
}