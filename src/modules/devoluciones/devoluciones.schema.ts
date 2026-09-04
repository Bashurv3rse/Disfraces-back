import { z } from "zod";

export const crearDevolucionSchema = z.object({
  alquilerId: z.string().uuid(),
  fechaDevolucion: z.string().min(1),
  observaciones: z.string().optional(),
});

export const actualizarEstadoSchema = z.object({
  estado: z.enum(["APROBADA", "RECHAZADA", "CON_OBSERVACIONES"]),
});

export type CrearDevolucionInput = z.infer<typeof crearDevolucionSchema>;