import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/prisma", () => ({ prisma: {} }));

import { chocaConTramo, tramoDeAlquiler } from "../../src/modules/disfraces/disfraces.service";
import { rangoDesdeTexto } from "../../src/modules/disfraces/rango";
import { estadoVisibleDeAlquiler } from "../../src/modules/alquileres/alquileres.service";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const hoy = d("2026-11-16"); // lunes

describe("disponibilidad por fechas", () => {
  it("un alquiler futuro no bloquea fechas anteriores a él", () => {
    const tramo = tramoDeAlquiler(d("2026-11-25"), d("2026-11-27"), hoy);
    expect(chocaConTramo({ inicio: d("2026-11-17"), fin: d("2026-11-18") }, tramo)).toBe(false);
  });

  it("bloquea fechas que se cruzan con el alquiler", () => {
    const tramo = tramoDeAlquiler(d("2026-11-25"), d("2026-11-27"), hoy);
    expect(chocaConTramo({ inicio: d("2026-11-26"), fin: d("2026-11-30") }, tramo)).toBe(true);
  });

  it("respeta los 3 días hábiles de lavado después del fin", () => {
    const tramo = tramoDeAlquiler(d("2026-11-25"), d("2026-11-27"), hoy); // vie 27 -> libre mié 02/12
    expect(chocaConTramo({ inicio: d("2026-11-30"), fin: d("2026-12-01") }, tramo)).toBe(true);
    expect(chocaConTramo({ inicio: d("2026-12-02"), fin: d("2026-12-03") }, tramo)).toBe(false);
  });

  it("un rango que termina justo antes necesita su propio lavado antes del siguiente alquiler", () => {
    const tramo = tramoDeAlquiler(d("2026-11-25"), d("2026-11-27"), hoy);
    expect(chocaConTramo({ inicio: d("2026-11-17"), fin: d("2026-11-23") }, tramo)).toBe(true);
    expect(chocaConTramo({ inicio: d("2026-11-17"), fin: d("2026-11-18") }, tramo)).toBe(false);
  });

  it("un alquiler vencido sin devolver sigue ocupando hasta hoy más el lavado", () => {
    const tramo = tramoDeAlquiler(d("2026-11-02"), d("2026-11-05"), hoy);
    expect(chocaConTramo({ inicio: d("2026-11-17"), fin: d("2026-11-17") }, tramo)).toBe(true);
  });

  it("rangoDesdeTexto valida las fechas", () => {
    expect(rangoDesdeTexto("2026-11-10", "2026-11-12")).toBeDefined();
    expect(rangoDesdeTexto("x", "2026-11-12")).toBeUndefined();
    expect(rangoDesdeTexto("2026-11-12", "2026-11-10")).toBeUndefined();
  });
});

describe("estado visible del alquiler", () => {
  const base = { fechaInicio: d("2026-11-20"), fechaFin: d("2026-11-22") };
  it("combina estado y fechas", () => {
    expect(estadoVisibleDeAlquiler({ ...base, estado: "ACTIVO" }, d("2026-11-16"))).toBe("PROXIMO");
    expect(estadoVisibleDeAlquiler({ ...base, estado: "ACTIVO" }, d("2026-11-21"))).toBe("EN_CURSO");
    expect(estadoVisibleDeAlquiler({ ...base, estado: "ACTIVO" }, d("2026-11-25"))).toBe("POR_DEVOLVER");
    expect(estadoVisibleDeAlquiler({ ...base, estado: "FINALIZADO" }, d("2026-11-25"))).toBe("FINALIZADO");
    expect(estadoVisibleDeAlquiler({ ...base, estado: "CANCELADO" })).toBe("CANCELADO");
    expect(estadoVisibleDeAlquiler({ ...base, estado: "PENDIENTE" })).toBe("PENDIENTE");
  });
});
