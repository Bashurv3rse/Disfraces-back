import { z } from "zod";

export const crearAlquilerSchema = z.object({
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
  evento: z.string().optional(),
  piezaIds: z.array(z.string().uuid()).min(1, "Debe incluir al menos una pieza"),
});

export type CrearAlquilerInput = z.infer<typeof crearAlquilerSchema>;