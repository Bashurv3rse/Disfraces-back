import { z } from "zod";

export const crearAlquilerSchema = z.object({
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
  evento: z.string().optional(),
  piezas: z
    .array(
      z.object({
        piezaId: z.string().uuid(),
        tallaElegida: z.string().optional(),
        colorElegido: z.string().optional(),
      })
    )
    .min(1, "Debe incluir al menos una pieza"),
});

export type CrearAlquilerInput = z.infer<typeof crearAlquilerSchema>;