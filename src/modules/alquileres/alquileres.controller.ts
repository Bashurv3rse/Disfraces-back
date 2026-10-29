import { Request, Response } from "express";
import { crearAlquilerSchema } from "./alquileres.schema";
import { crearAlquiler, listarPropios, listarTodos, resumenAdmin } from "./alquileres.service";
import { ErrorCotizacion } from "../pagos/precios.service";
import { validarSoloCatalogo } from "../pagos/carrito.service";
import { disfracesNoDisponibles } from "../disfraces/disfraces.service";

export async function crear(req: Request, res: Response) {
  const parseo = crearAlquilerSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });
  }

  try {
    await validarSoloCatalogo(parseo.data.disfraces);
    // El alquiler presencial también respeta las reservas de ajustes de talla,
    // incluidos los disfraces donantes que tienen piezas intercambiadas.
    const noDisponibles = await disfracesNoDisponibles(parseo.data.disfraces);
    if (noDisponibles.length > 0) {
      const detalle = noDisponibles.map(d => `«${d.nombre}» (${d.estado.toLowerCase()})`).join(", ");
      throw new ErrorCotizacion(`No se puede crear el alquiler: ${detalle}.`, 409);
    }
    const alquiler = await crearAlquiler(parseo.data, req.usuario!.id);
    return res.status(201).json(alquiler);
  } catch (error) {
    if (error instanceof ErrorCotizacion) {
      return res.status(error.estado).json({ mensaje: error.message });
    }
    return res.status(500).json({ mensaje: "No se pudo crear el alquiler" });
  }
}

export async function misAlquileres(req: Request, res: Response) {
  return res.json(await listarPropios(req.usuario!.id));
}

export async function todos(_req: Request, res: Response) {
  return res.json(await listarTodos());
}

export async function resumen(_req: Request, res: Response) {
  return res.json(await resumenAdmin());
}
