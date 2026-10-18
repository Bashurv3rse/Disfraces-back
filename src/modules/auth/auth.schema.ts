import { z } from "zod";

const passwordRobusta = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Z]/, "Debe incluir al menos una mayúscula")
  .regex(/[a-z]/, "Debe incluir al menos una minúscula")
  .regex(/[0-9]/, "Debe incluir al menos un número")
  .regex(
    /[^A-Za-z0-9]/,
    "Debe incluir al menos un carácter especial (ej. !@#$%)"
  );

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

export const actualizarRolSchema = z.object({
  rol: z.enum(["CLIENTE", "ADMINISTRADOR", "PROVEEDOR"]),
});

// El perfil solo admite estos tres campos.
// El correo y el rol no se pueden cambiar desde aquí.
export const actualizarPerfilSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres"),

  telefono: z
    .string()
    .trim()
    .min(9, "Ingresa un teléfono válido"),

  direccion: z
    .string()
    .trim()
    .min(5, "Ingresa una dirección válida"),
});

export const cambiarPasswordSchema = z
  .object({
    passwordActual: z
      .string()
      .min(1, "Ingresa tu contraseña actual"),

    passwordNueva: passwordRobusta,
  })
  .refine(
    (datos) => datos.passwordActual !== datos.passwordNueva,
    {
      message: "La contraseña nueva debe ser distinta de la actual",
      path: ["passwordNueva"],
    }
  );

export type RegistroInput = z.infer<typeof registroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ActualizarRolInput = z.infer<typeof actualizarRolSchema>;
export type ActualizarPerfilInput = z.infer<typeof actualizarPerfilSchema>;
export type CambiarPasswordInput = z.infer<typeof cambiarPasswordSchema>;