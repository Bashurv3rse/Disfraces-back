import { z } from "zod";

const passwordRobusta = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Z]/, "Debe incluir al menos una mayúscula")
  .regex(/[a-z]/, "Debe incluir al menos una minúscula")
  .regex(/[0-9]/, "Debe incluir al menos un número")
  .regex(/[^A-Za-z0-9]/, "Debe incluir al menos un carácter especial (ej. !@#$%)");

export const registroSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: passwordRobusta,
  telefono: z.string().min(6, "Ingresa un teléfono válido"),
  direccion: z.string().min(5, "Ingresa una dirección válida"),
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