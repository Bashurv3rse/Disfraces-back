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

export const actualizarEstadoManualSchema = z.object({
  estado: z.enum(["EN_REPARACION", "SUSPENDIDO"]).nullable(),
});

export const actualizarPrendaSchema = z.object({
  estado: z.enum(["DISPONIBLE", "DANADA", "FALTANTE"]).optional(),
  calidad: z.string().min(1).optional(),
});

export const confirmarPrestamoSchema = z.object({
  prendaDonanteId: z.string().uuid(),
});

export type CrearDisfrazInput = z.infer<typeof crearDisfrazSchema>;