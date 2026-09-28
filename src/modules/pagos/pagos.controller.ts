import { Request, Response } from "express";
import { crearSesionSchema } from "./pagos.schema";
import { crearSesionCheckout, confirmarPago } from "./pagos.service";

export async function crearSesion(req: Request, res: Response) {
  const parseo = crearSesionSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const { url } = await crearSesionCheckout(parseo.data, req.usuario!.id);
    return res.status(201).json({ url });
  } catch (error: any) {
    return res.status(400).json({ mensaje: error.message });
  }
}

export async function confirmar(req: Request, res: Response) {
  const { sessionId } = req.body;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ mensaje: "Falta el session_id de Stripe" });
  }
  try {
    const alquiler = await confirmarPago(sessionId, req.usuario!.id);
    return res.status(200).json(alquiler);
  } catch (error: any) {
    return res.status(409).json({ mensaje: error.message });
  }
}