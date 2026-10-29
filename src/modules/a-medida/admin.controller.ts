import { Request, Response } from "express";
import { z } from "zod";
import { ErrorAdminAMedida, listarDemanda, listarEnCurso, marcarDemandaAtendida } from "./admin.service";

const atendidaSchema = z.object({ textoNormalizado: z.string().min(1).max(200) });

function responderError(res: Response, error: unknown) {
  if (error instanceof ErrorAdminAMedida) return res.status(error.estado).json({ mensaje: error.message });
  console.error(error);
  return res.status(500).json({ mensaje: "No se pudo completar la operación. Intenta de nuevo." });
}

export async function demanda(_req: Request, res: Response) {
  try {
    return res.json(await listarDemanda());
  } catch (error) {
    return responderError(res, error);
  }
}

export async function atender(req: Request, res: Response) {
  const parseo = atendidaSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  try {
    return res.json(await marcarDemandaAtendida(parseo.data.textoNormalizado));
  } catch (error) {
    return responderError(res, error);
  }
}

export async function enCurso(_req: Request, res: Response) {
  try {
    return res.json(await listarEnCurso());
  } catch (error) {
    return responderError(res, error);
  }
}