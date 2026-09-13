import { z } from "zod";

const prendaSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(["SOMBRERO", "CAMISA", "PANTALON", "FALDA", "ZAPATO", "ABRIGO", "CHALECO", "ACCESORIO", "PANUELO", "TACON"]),
  color: z.string().min(1),
  talla: z.string().min(1),
});

export const crearDisfrazSchema = z.object({
  nombre: z.string().min(2),
  tipoDisfraz: z.string().min(2),
  temporadaEvento: z.string().min(1),
  precioAlquiler: z.number().positive(),
  prendas: z.array(prendaSchema).min(1, "Debe incluir al menos una prenda"),
});

export type CrearDisfrazInput = z.infer<typeof crearDisfrazSchema>;