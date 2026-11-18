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

import { diasBloqueadosParaInicio } from "../../src/modules/disfraces/disfraces.service";
import { tallaPrincipal, tallasDelDisfraz } from "../../src/modules/alquileres/alquileres.service";

describe("calendario del cliente (días bloqueados para iniciar un alquiler)", () => {
  const hoyLun = d("2026-11-16");

  it("incluye el alquiler, su lavado y los días previos cuyo lavado se cruzaría", () => {
    // Alquiler vie 20 – dom 22: el lavado cuenta lun 23, mar 24 y mié 25.
    const tramo = tramoDeAlquiler(d("2026-11-20"), d("2026-11-22"), hoyLun);
    const r = diasBloqueadosParaInicio([tramo], null, hoyLun);
    expect(r).toHaveLength(1);
    // El lun 16 todavía permite un alquiler de 1 día cuyo lavado termina antes del 20.
    expect(r[0].desde > "2026-11-16").toBe(true);
    expect(r[0].desde <= "2026-11-20").toBe(true);
    expect(r[0].hasta).toBe("2026-11-24"); // libre de nuevo desde el miércoles 25
  });

  it("los días marcados coinciden con lo que el servidor rechaza", () => {
    const tramo = tramoDeAlquiler(d("2026-11-20"), d("2026-11-22"), hoyLun);
    const [bloque] = diasBloqueadosParaInicio([tramo], null, hoyLun);
    for (let t = d("2026-11-16").getTime(); t <= d("2026-12-10").getTime(); t += 86_400_000) {
      const dia = new Date(t);
      const iso = dia.toISOString().slice(0, 10);
      const marcado = iso >= bloque.desde && iso <= bloque.hasta;
      expect(chocaConTramo({ inicio: dia, fin: dia }, tramo)).toBe(marcado);
    }
  });

  it("une alquileres consecutivos y agrega el lavado en curso", () => {
    const a = tramoDeAlquiler(d("2026-11-16"), d("2026-11-16"), hoyLun);
    const b = tramoDeAlquiler(d("2026-11-23"), d("2026-11-24"), hoyLun);
    expect(diasBloqueadosParaInicio([a, b], null, hoyLun).length).toBeGreaterThan(0);
    const conLavado = diasBloqueadosParaInicio([], d("2026-11-19"), hoyLun);
    expect(conLavado).toEqual([{ desde: "2026-11-16", hasta: "2026-11-18" }]);
  });

  it("ignora alquileres que ya terminaron", () => {
    const viejo = { desde: d("2026-10-01"), hasta: d("2026-10-05") };
    expect(diasBloqueadosParaInicio([viejo], null, hoyLun)).toEqual([]);
  });
});

describe("tallas del historial de alquileres", () => {
  it("toma la talla de ropa y la de calzado, sin contar tallas únicas", () => {
    const prendas = [
      { tipo: "CAMISA", talla: "L" },
      { tipo: "PANTALON", talla: "L" },
      { tipo: "ZAPATO", talla: "41" },
      { tipo: "ACCESORIO", talla: "única" },
    ];
    expect(tallaPrincipal(prendas, "ROPA")).toBe("L");
    expect(tallaPrincipal(prendas, "CALZADO")).toBe("41");
    expect(tallaPrincipal([{ tipo: "PANUELO", talla: "única" }], "ROPA")).toBeNull();
  });
});

describe("tallas de un disfraz a medida en el historial", () => {
  it("usa las tallas de la reserva cuando el disfraz no tiene piezas propias", () => {
    expect(
      tallasDelDisfraz({ prendasHogar: [], prendasActuales: [], reservas: [{ tallaRopa: "M", tallaCalzado: "40" }] })
    ).toEqual({ ropa: "M", calzado: "40" });
  });
  it("si no hay reserva, usa las piezas que tenía puestas", () => {
    expect(tallasDelDisfraz({ prendasHogar: [], prendasActuales: [{ tipo: "CAMISA", talla: "XL" }, { tipo: "ZAPATO", talla: "43" }], reservas: [] })).toEqual({ ropa: "XL", calzado: "43" });
  });
  it("un disfraz del catálogo sigue usando sus propias piezas", () => {
    expect(tallasDelDisfraz({ prendasHogar: [{ tipo: "CAMISA", talla: "L" }, { tipo: "ZAPATO", talla: "38" }], reservas: [{ tallaRopa: "S", tallaCalzado: "36" }] })).toEqual({ ropa: "L", calzado: "38" });
  });
});
