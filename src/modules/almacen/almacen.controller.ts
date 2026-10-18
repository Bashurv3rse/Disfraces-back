import { Request, Response } from "express";
import { agregarPiezasSchema, retirarPiezasSchema } from "./almacen.schema";
import { listarAlmacen, agregarPiezas, retirarPiezas, ErrorAlmacen } from "./almacen.service";
import { registrarEventoSeguridad } from "../../common/logger";

export async function listar(_req: Request, res: Response) {
  return res.json(await listarAlmacen());
}

export async function agregar(req: Request, res: Response) {
  const parseo = agregarPiezasSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const resultado = await agregarPiezas(parseo.data);
    registrarEventoSeguridad({
      evento: "ALMACEN_PIEZAS_AGREGADAS",
      usuarioId: req.usuario!.id,
      ip: req.ip,
      detalle: `${resultado.agregadas} × ${parseo.data.nombre}`,
    });
    return res.status(201).json(resultado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: "No se pudieron agregar las piezas" });
  }
}

export async function retirar(req: Request, res: Response) {
  const parseo = retirarPiezasSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const resultado = await retirarPiezas(parseo.data);
    registrarEventoSeguridad({
      evento: "ALMACEN_PIEZAS_RETIRADAS",
      usuarioId: req.usuario!.id,
      ip: req.ip,
      detalle: `${resultado.retiradas} × ${parseo.data.nombre} (${parseo.data.talla})`,
    });
    return res.json(resultado);
  } catch (error) {
    if (error instanceof ErrorAlmacen) return res.status(error.estado).json({ mensaje: error.message });
    console.error(error);
    return res.status(500).json({ mensaje: "No se pudieron retirar las piezas" });
  }
}