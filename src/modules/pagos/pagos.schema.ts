import { z } from "zod";

const camposComunes = {
  fechaInicio: z.string().min(1, "Elige la fecha de inicio"),
  fechaFin: z.string().min(1, "Elige la fecha de fin"),
  disfraces: z
    .array(z.string().uuid())
    .min(1, "Debe incluir al menos un disfraz")
    .max(10, "El carrito admite como máximo 10 disfraces"),
  codigo: z.string().trim().max(40).optional(),
};

export const cotizarSchema = z.object(camposComunes);

export const crearSesionSchema = z.object({
  ...camposComunes,
  evento: z.string().trim().max(120, "El nombre del evento es demasiado largo").optional(),
});

export type CotizarInput = z.infer<typeof cotizarSchema>;
export type CrearSesionInput = z.infer<typeof crearSesionSchema>;