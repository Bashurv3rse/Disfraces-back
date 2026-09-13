import { z } from "zod";

export const crearProveedorSchema = z.object({
  nombre: z.string().min(2),
  contacto: z.string().min(2),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
});

export const asociarPrendaSchema = z.object({
  prendaId: z.string().uuid(),
});

export type CrearProveedorInput = z.infer<typeof crearProveedorSchema>;