import { Request, Response } from "express";
import { crearProveedorSchema, asociarPrendaSchema } from "./proveedores.schema";
import { crearProveedor, listarProveedores, asociarPrenda } from "./proveedores.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearProveedorSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  const proveedor = await crearProveedor(parseo.data);
  return res.status(201).json(proveedor);
}

export async function listar(_req: Request, res: Response) {
  return res.json(await listarProveedores());
}

export async function asociar(req: Request, res: Response) {
  const parseo = asociarPrendaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }
  try {
    const relacion = await asociarPrenda(req.params.id, parseo.data.prendaId);
    return res.status(201).json(relacion);
  } catch {
    return res.status(400).json({ mensaje: "No se pudo asociar la prenda (¿ya estaba asociada?)" });
  }
}