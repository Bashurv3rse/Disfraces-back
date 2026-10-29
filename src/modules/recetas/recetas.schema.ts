import { z } from "zod";
import { TIPOS_PRENDA } from "../disfraces/disfraces.schema";

const huecoSchema = z.object({
  etiqueta: z.string().trim().min(2, "Cada hueco necesita un nombre (ej. Casco)").max(40),
  tipo: z.enum(TIPOS_PRENDA),
  colores: z.array(z.string().trim().min(2).max(30)).max(8, "Máximo 8 colores por hueco").default([]),
  nombreContiene: z.string().trim().max(60).optional(),
  obligatoria: z.boolean().default(true),
});

export const recetaSchema = z
  .object({
    nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(60),
    descripcion: z.string().trim().max(300).optional(),
    palabrasClave: z
      .array(z.string().trim().min(2).max(40))
      .min(1, "Agrega al menos una palabra clave")
      .max(15, "Máximo 15 palabras clave"),
    precioDia: z.number().positive("El precio debe ser mayor que 0").max(100000),
    activa: z.boolean().default(true),
    piezas: z.array(huecoSchema).min(1, "La receta necesita al menos un hueco").max(12, "Máximo 12 huecos"),
  })
  .refine((d) => d.piezas.some((p) => p.obligatoria), {
    message: "Al menos un hueco debe ser obligatorio",
    path: ["piezas"],
  });

export const activarRecetaSchema = z.object({ activa: z.boolean() });

export type RecetaInput = z.infer<typeof recetaSchema>;