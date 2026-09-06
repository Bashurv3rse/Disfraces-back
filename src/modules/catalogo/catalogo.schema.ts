import { z } from "zod";

export const crearPiezaSchema = z.object({
  nombre: z.string().min(2),
  tipo: z.enum(["SOMBRERO", "CAMISA_POLO", "PANTALON", "ZAPATO_ZAPATILLA", "ABRIGO", "CHALECO", "TRAJE", "TACON", "ACCESORIO"]),
  tallaEEUU: z.string().min(1),
  color: z.string().min(1),
  modelo: z.string().optional(),
  temporadaOriginal: z.string().min(1),
  stock: z.number().int().min(0),
  precioAlquiler: z.number().positive(),
  tallasDisponibles: z.array(z.string()).min(1).optional(),
  coloresDisponibles: z.array(z.string()).min(1).optional(),
});

export type CrearPiezaInput = z.infer<typeof crearPiezaSchema>;

export const actualizarStockSchema = z.object({
  stock: z.number().int().min(0),
});

export type ActualizarStockInput = z.infer<typeof actualizarStockSchema>;