import { z } from "zod";

export const registroSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export type RegistroInput = z.infer<typeof registroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export const actualizarRolSchema = z.object({
  rol: z.enum(["CLIENTE", "ADMINISTRADOR", "PROVEEDOR"]),
});

export type ActualizarRolInput = z.infer<typeof actualizarRolSchema>;