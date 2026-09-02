import { z } from "zod";

export const crearConjuntoSchema = z.object({
  nombre: z.string().min(2),
  tipo: z.enum(["PREDETERMINADO", "PERSONALIZADO"]),
  temporadaEvento: z.string().min(1),
  piezaIds: z.array(z.string().uuid()).min(1, "Debe incluir al menos una pieza"),
});

export type CrearConjuntoInput = z.infer<typeof crearConjuntoSchema>;