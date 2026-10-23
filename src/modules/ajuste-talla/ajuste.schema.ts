import { z } from "zod";

// Una talla vacía ("") equivale a «sin indicar».
const tallaOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(10, "Talla no válida").optional()
);

const tallasSchema = z.object({
  ropa: tallaOpcional,
  calzado: tallaOpcional,
  // Ajuste opcional por pieza: id de la prenda del disfraz -> talla.
  ajustes: z
    .record(z.string().uuid("Ajuste de talla inválido"), z.string().trim().max(10, "Talla no válida"))
    .optional()
    .transform((a) => (a ? Object.fromEntries(Object.entries(a).filter(([, v]) => v !== "")) : undefined))
    .refine((a) => !a || Object.keys(a).length <= 20, "Demasiados ajustes de talla"),
});

export const disfrazIdSchema = z.string().uuid("Disfraz inválido");

export const ajusteSchema = z.object({
  disfrazId: disfrazIdSchema,
  tallas: tallasSchema.optional(),
  // Disfraces que la persona ya tiene en el carrito: nunca se usan como donantes.
  excluir: z.array(disfrazIdSchema).max(10).optional(),
});