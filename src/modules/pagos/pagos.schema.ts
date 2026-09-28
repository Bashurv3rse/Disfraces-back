import { z } from "zod";

export const crearSesionSchema = z.object({
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
  evento: z.string().optional(),
  disfraces: z.array(z.string().uuid()).min(1, "Debe incluir al menos un disfraz"),
});

export type CrearSesionInput = z.infer<typeof crearSesionSchema>;