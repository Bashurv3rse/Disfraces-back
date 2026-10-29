import { describe, expect, it } from "vitest";

import {
  corregirPrendaSchema,
  crearDevolucionSchema,
  resolverGarantiaSchema,
} from "../../src/modules/devoluciones/devoluciones.schema";

describe("Pruebas funcionales - devolución y garantía", () => {
  const alquilerId = "550e8400-e29b-41d4-a716-446655440000";
  const prendaId = "550e8400-e29b-41d4-a716-446655440001";

  it("PF-11: acepta una devolución con todas las prendas reportadas correctamente", () => {
    const resultado = crearDevolucionSchema.safeParse({
      alquilerId,
      fechaDevolucion: "2026-10-24",
      prendas: [
        {
          prendaId,
          estadoPrenda: "BUEN_ESTADO",
        },
      ],
      observaciones: "Devolución sin inconvenientes",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-12: rechaza una devolución sin prendas reportadas", () => {
    const resultado = crearDevolucionSchema.safeParse({
      alquilerId,
      fechaDevolucion: "2026-10-24",
      prendas: [],
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe(
        "Debe reportar el estado de al menos una prenda"
      );
    }
  });

  it("PF-13: rechaza un estado de prenda no permitido", () => {
    const resultado = crearDevolucionSchema.safeParse({
      alquilerId,
      fechaDevolucion: "2026-10-24",
      prendas: [
        {
          prendaId,
          estadoPrenda: "PERDIDA",
        },
      ],
    });

    expect(resultado.success).toBe(false);
  });

  it("PF-14: acepta la corrección de una prenda a DANADA", () => {
    const resultado = corregirPrendaSchema.safeParse({
      estado: "DANADA",
      observacion: "Mancha encontrada en la manga",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-15: rechaza una observación de corrección mayor a 200 caracteres", () => {
    const resultado = corregirPrendaSchema.safeParse({
      estado: "DANADA",
      observacion: "A".repeat(201),
    });

    expect(resultado.success).toBe(false);

    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe(
        "La nota es demasiado larga"
      );
    }
  });

  it("PF-16: permite devolver la garantía sin indicar motivo", () => {
    const resultado = resolverGarantiaSchema.safeParse({
      accion: "DEVOLVER",
    });

    expect(resultado.success).toBe(true);
  });

  it("PF-17: rechaza retener la garantía sin un motivo válido", () => {
    const sinMotivo = resolverGarantiaSchema.safeParse({
      accion: "RETENER",
    });

    const motivoCorto = resolverGarantiaSchema.safeParse({
      accion: "RETENER",
      motivo: "no",
    });

    expect(sinMotivo.success).toBe(false);
    expect(motivoCorto.success).toBe(false);

    if (!motivoCorto.success) {
      expect(motivoCorto.error.issues[0].message).toBe(
        "Indica el motivo de la retención (mínimo 5 caracteres)."
      );
    }
  });

  it("PF-18: permite retener la garantía cuando se proporciona un motivo válido", () => {
    const resultado = resolverGarantiaSchema.safeParse({
      accion: "RETENER",
      motivo: "Prenda entregada con daños",
    });

    expect(resultado.success).toBe(true);
  });
});