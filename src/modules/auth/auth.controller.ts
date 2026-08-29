import { Request, Response } from "express";
import { registroSchema, loginSchema } from "./auth.schema";
import { registrarUsuario, iniciarSesion } from "./auth.service";

export async function registro(req: Request, res: Response) {
  const parseo = registroSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  try {
    const resultado = await registrarUsuario(parseo.data);
    return res.status(201).json(resultado);
  } catch (error: any) {
    return res.status(400).json({ mensaje: error.message });
  }
}

export async function login(req: Request, res: Response) {
  const parseo = loginSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  try {
    const resultado = await iniciarSesion(parseo.data);
    return res.status(200).json(resultado);
  } catch (error: any) {
    return res.status(401).json({ mensaje: error.message });
  }
}