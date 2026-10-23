import { Request, Response } from "express";
import { ajusteSchema, disfrazIdSchema } from "./ajuste.schema";
import { ErrorAjuste, infoAjuste, previsualizarAjuste, reservarAjuste } from "./ajuste.service";
import type { TallasPedido } from "../a-medida/armado.service";
import { registrarEventoSeguridad } from "../../common/logger";

// Nunca se responde 401 desde aquí: el interceptor del frontend lo trataría como sesión vencida.
function responderError(error: unknown, res: Response) {
  if (error instanceof ErrorAjuste) {
    const extra = typeof error.datos === "object" && error.datos ? (error.datos as Record<string, unknown>) : {};
    return res.status(error.estado).json({ mensaje: error.message, ...extra });
  }
  console.error(error);
  return res.status(500).json({ mensaje: "No se pudo completar la operación. Intenta de nuevo." });
}

export async function info(req: Request, res: Response) {
  const id = disfrazIdSchema.safeParse(req.params.disfrazId);
  if (!id.success) return res.status(400).json({ mensaje: "Disfraz inválido" });

  try {
    return res.json(await infoAjuste(id.data, req.usuario!.id));
  } catch (error) {
    return responderError(error, res);
  }
}

export async function previsualizar(req: Request, res: Response) {
  const parseo = ajusteSchema.safeParse(req.body);

  if (!parseo.success) {
    return res.status(400).json({
      errores: parseo.error.flatten().fieldErrors,
    });
  }

  try {
    const tallas: TallasPedido = parseo.data.tallas ?? {};

    return res.json(
      await previsualizarAjuste(
        parseo.data.disfrazId,
        tallas,
        req.usuario!.id,
        parseo.data.excluir ?? []
      )
    );
  } catch (error) {
    return responderError(error, res);
  }
}

export async function reservar(req: Request, res: Response) {
  const parseo = ajusteSchema.safeParse(req.body);

  if (!parseo.success) {
    return res.status(400).json({
      errores: parseo.error.flatten().fieldErrors,
    });
  }

  try {
    const tallas: TallasPedido = parseo.data.tallas ?? {};

    const { reserva, auditoria } = await reservarAjuste(
      parseo.data.disfrazId,
      tallas,
      req.usuario!.id,
      parseo.data.excluir ?? []
    );

    registrarEventoSeguridad({
      evento: "AJUSTE_TALLA_RESERVADO",
      usuarioId: req.usuario!.id,
      ip: req.ip,
      detalle: auditoria,
    });

    return res.status(201).json(reserva);
  } catch (error) {
    return responderError(error, res);
  }
}