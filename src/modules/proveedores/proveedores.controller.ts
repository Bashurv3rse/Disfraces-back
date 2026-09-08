import { Request, Response } from "express";
import { crearProveedorSchema, asociarPiezaSchema } from "./proveedores.schema";
import { crearProveedor, listarProveedores, asociarPieza } from "./proveedores.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearProveedorSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  const proveedor = await crearProveedor(parseo.data);
  return res.status(201).json(proveedor);
}

export async function listar(_req: Request, res: Response) {
  const proveedores = await listarProveedores();
  return res.json(proveedores);
}

export async function asociar(req: Request, res: Response) {
  const parseo = asociarPiezaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  try {
    const relacion = await asociarPieza(req.params.id, parseo.data.piezaId);
    return res.status(201).json(relacion);
  } catch {
    return res.status(400).json({ mensaje: "No se pudo asociar la pieza (¿ya estaba asociada?)" });
  }
}