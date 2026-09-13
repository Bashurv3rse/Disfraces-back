import { z } from "zod";

export const crearDevolucionSchema = z.object({
  alquilerId: z.string().uuid(),
  fechaDevolucion: z.string().min(1),
  prendas: z
    .array(
      z.object({
        prendaId: z.string().uuid(),
        estadoPrenda: z.enum(["BUEN_ESTADO", "DANADA", "FALTANTE"]),
      })
    )
    .min(1, "Debe reportar el estado de al menos una prenda"),
  observaciones: z.string().optional(),
});

export const actualizarEstadoSchema = z.object({
  estado: z.enum(["APROBADA", "RECHAZADA", "CON_OBSERVACIONES"]),
});

export type CrearDevolucionInput = z.infer<typeof crearDevolucionSchema>;