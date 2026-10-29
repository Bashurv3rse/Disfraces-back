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

export type CrearDevolucionInput = z.infer<typeof crearDevolucionSchema>;

export const corregirPrendaSchema = z.object({
  estado: z.enum(["BUEN_ESTADO", "DANADA", "FALTANTE"]),
  observacion: z.string().trim().max(200, "La nota es demasiado larga").optional(),
});

export const resolverGarantiaSchema = z
  .object({
    accion: z.enum(["DEVOLVER", "RETENER"]),
    motivo: z.string().trim().max(300, "El motivo es demasiado largo").optional(),
  })
  .refine((d) => d.accion === "DEVOLVER" || (d.motivo !== undefined && d.motivo.length >= 5), {
    message: "Indica el motivo de la retención (mínimo 5 caracteres).",
    path: ["motivo"],
  });