import { Request, Response } from "express";
import { crearConjuntoSchema } from "./conjuntos.schema";
import { crearConjunto, listarConjuntos } from "./conjuntos.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearConjuntoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  // Regla de negocio: un conjunto PREDETERMINADO solo lo crea un administrador
  // (catálogo oficial de temporada); un PERSONALIZADO lo arma cualquier usuario autenticado.
  if (parseo.data.tipo === "PREDETERMINADO" && req.usuario?.rol !== "ADMINISTRADOR") {
    return res.status(403).json({ mensaje: "Solo un administrador puede crear conjuntos predeterminados" });
  }

  const conjunto = await crearConjunto(parseo.data, req.usuario?.id);
  return res.status(201).json(conjunto);
}

export async function listar(req: Request, res: Response) {
  const { tipo, temporadaEvento } = req.query;
  const conjuntos = await listarConjuntos({
    tipo: tipo as string,
    temporadaEvento: temporadaEvento as string,
  });
  return res.json(conjuntos);
}