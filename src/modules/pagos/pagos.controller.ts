import { Request, Response } from "express";
import { crearSesionSchema, cotizarSchema } from "./pagos.schema";
import { crearSesionCheckout, confirmarPago } from "./pagos.service";
import { cotizar, listarOfertasVigentes, ErrorCotizacion } from "./precios.service";
import { prepararCarrito } from "./carrito.service";
import { ErrorReserva } from "../a-medida/reservas.service";

function responderError(error: unknown, res: Response, mensajePorDefecto: string) {
  if (error instanceof ErrorCotizacion || error instanceof ErrorReserva) {
    return res.status(error.estado).json({ mensaje: error.message });
  }
  console.error(error);
  return res.status(500).json({ mensaje: mensajePorDefecto });
}

// Precio del carrito: lo que el cliente ve antes de pagar. Solo informa, no cobra ni guarda nada.
export async function cotizarController(req: Request, res: Response) {
  const parseo = cotizarSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const { reservas } = await prepararCarrito(parseo.data.disfraces, req.usuario!.id);
    const cotizacion = await cotizar(parseo.data);
    // `centavos` es de uso interno (Stripe): no se expone.
    return res.json({ ...cotizacion, centavos: undefined, reservas });
  } catch (error) {
    return responderError(error, res, "No se pudo calcular el precio");
  }
}

// Ofertas automáticas vigentes, públicas, para mostrarlas en el catálogo.
export async function ofertas(_req: Request, res: Response) {
  return res.json(await listarOfertasVigentes());
}

export async function crearSesion(req: Request, res: Response) {
  const parseo = crearSesionSchema.safeParse(req.body);
  if (!parseo.success) return res.status(400).json({ errores: parseo.error.flatten().fieldErrors });

  try {
    const { url } = await crearSesionCheckout(parseo.data, req.usuario!.id);
    return res.status(201).json({ url });
  } catch (error) {
    return responderError(error, res, "No se pudo iniciar el pago. Intenta de nuevo.");
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