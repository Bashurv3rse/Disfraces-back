import { z } from "zod";

export const buscarSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(2, "Escribe qué disfraz quieres")
    .max(80, "El texto es demasiado largo (máximo 80 caracteres)"),
});

// Una talla vacía ("") equivale a «sin indicar».
const tallaOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(10, "Talla no válida").optional()
);

const tallasSchema = z.object({
  ropa: tallaOpcional,
  calzado: tallaOpcional,
  // Ajuste opcional por pieza: id del hueco de la receta -> talla.
  ajustes: z
    .record(z.string().uuid("Ajuste de talla inválido"), z.string().trim().max(10, "Talla no válida"))
    .optional()
    .transform((a) => (a ? Object.fromEntries(Object.entries(a).filter(([, v]) => v !== "")) : undefined))
    .refine((a) => !a || Object.keys(a).length <= 12, "Demasiados ajustes de talla"),
});

export const previsualizarSchema = z.object({
  recetaId: z.string().uuid("Receta inválida"),
  tallas: tallasSchema.optional(),
});

export const reservarSchema = previsualizarSchema.extend({
  peticion: z.string().trim().max(80).optional(),
});