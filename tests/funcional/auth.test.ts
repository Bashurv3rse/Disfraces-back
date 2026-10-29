import { describe, expect, it } from "vitest";

import {
  registroSchema,
  loginSchema,
  actualizarRolSchema,
  actualizarPerfilSchema,
  cambiarPasswordSchema,
  actualizarTallasSchema,
} from "../../src/modules/auth/auth.schema";

describe("Pruebas funcionales - autenticación y perfil", () => {
  it("PF-19: acepta el registro con datos válidos y contraseña robusta", () => {
    const resultado = registroSchema.safeParse({
      nombre: "Mauro",
      email: "mauro@example.com",
      password: "Clave123!",
      telefono: "987654321",
      direccion: "Av. Principal 123",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-20: rechaza el registro con un email inválido", () => {
    const resultado = registroSchema.safeParse({
      nombre: "Mauro",
      email: "correo-invalido",
      password: "Clave123!",
      telefono: "987654321",
      direccion: "Av. Principal 123",
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      expect(resultado.error.flatten().fieldErrors.email).toContain(
        "Email inválido"
      );
    }
  });

  it("PF-21: rechaza una contraseña que no cumple los requisitos de seguridad", () => {
    const resultado = registroSchema.safeParse({
      nombre: "Mauro",
      email: "mauro@example.com",
      password: "clave",
      telefono: "987654321",
      direccion: "Av. Principal 123",
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      const errores = resultado.error.flatten().fieldErrors.password ?? [];

      expect(errores).toContain(
        "La contraseña debe tener al menos 8 caracteres"
      );
      expect(errores).toContain(
        "Debe incluir al menos una mayúscula"
      );
      expect(errores).toContain(
        "Debe incluir al menos un número"
      );
      expect(errores).toContain(
        "Debe incluir al menos un carácter especial (ej. !@#$%)"
      );
    }
  });

  it("PF-22: acepta credenciales de inicio de sesión con formato válido", () => {
    const resultado = loginSchema.safeParse({
      email: "mauro@example.com",
      password: "Clave123!",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-23: rechaza un inicio de sesión con email inválido o contraseña vacía", () => {
    const resultado = loginSchema.safeParse({
      email: "correo-invalido",
      password: "",
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      const errores = resultado.error.flatten().fieldErrors;

      expect(errores.email).toContain("Email inválido");
      expect(errores.password).toContain(
        "La contraseña es obligatoria"
      );
    }
  });

  it("PF-24: acepta únicamente los roles definidos por el sistema", () => {
    expect(
      actualizarRolSchema.safeParse({
        rol: "CLIENTE",
      }).success
    ).toBe(true);

    expect(
      actualizarRolSchema.safeParse({
        rol: "ADMINISTRADOR",
      }).success
    ).toBe(true);

    expect(
      actualizarRolSchema.safeParse({
        rol: "PROVEEDOR",
      }).success
    ).toBe(true);

    expect(
      actualizarRolSchema.safeParse({
        rol: "SUPERADMIN",
      }).success
    ).toBe(false);
  });

  it("PF-25: acepta la actualización de perfil con datos válidos", () => {
    const resultado = actualizarPerfilSchema.safeParse({
      nombre: "Mauro Andres",
      telefono: "987654321",
      direccion: "Av. Principal 456",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-26: rechaza una actualización de perfil con datos insuficientes", () => {
    const resultado = actualizarPerfilSchema.safeParse({
      nombre: "M",
      telefono: "123",
      direccion: "Lima",
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      const errores = resultado.error.flatten().fieldErrors;

      expect(errores.nombre).toContain(
        "El nombre debe tener al menos 2 caracteres"
      );
      expect(errores.telefono).toContain(
        "Ingresa un teléfono válido"
      );
      expect(errores.direccion).toContain(
        "Ingresa una dirección válida"
      );
    }
  });

  it("PF-27: acepta el cambio hacia una contraseña nueva y robusta", () => {
    const resultado = cambiarPasswordSchema.safeParse({
      passwordActual: "Clave123!",
      passwordNueva: "NuevaClave456!",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-28: rechaza usar la misma contraseña como contraseña nueva", () => {
    const resultado = cambiarPasswordSchema.safeParse({
      passwordActual: "Clave123!",
      passwordNueva: "Clave123!",
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      expect(
        resultado.error.flatten().fieldErrors.passwordNueva
      ).toContain(
        "La contraseña nueva debe ser distinta de la actual"
      );
    }
  });

  it("PF-29: normaliza la talla de ropa a mayúsculas", () => {
    const resultado = actualizarTallasSchema.safeParse({
      tallaRopa: "m",
    });

    expect(resultado.success).toBe(true);

    if (resultado.success) {
      expect(resultado.data.tallaRopa).toBe("M");
    }
  });

  it("PF-30: rechaza tallas que no pertenecen a los valores permitidos", () => {
    const resultado = actualizarTallasSchema.safeParse({
      tallaRopa: "XXXX",
      tallaCalzado: "100",
    });

    expect(resultado.success).toBe(false);
  });
});