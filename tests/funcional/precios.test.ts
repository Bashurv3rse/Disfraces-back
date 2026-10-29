import type { Promocion } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/config/prisma";

vi.mock("../../src/config/prisma", () => ({ prisma: {
  disfrazFisico: { findMany: vi.fn() }, promocion: { findMany: vi.fn() },
} }));

import {
  calcularCotizacion,
  calcularDias,
  normalizarCodigo,
  PORCENTAJE_GARANTIA,
  cotizar,
  listarOfertasVigentes,
} from "../../src/modules/pagos/precios.service";

describe("Pruebas funcionales - cotización de alquiler", () => {
  const disfraz = {
    id: "disfraz-1",
    nombre: "Batman",
    tipoDisfraz: "Superhéroe",
    temporadaEvento: "halloween",
    precioAlquiler: 40,
  };

  const hoy = new Date("2026-10-20T00:00:00.000Z");

  it("PF-01: calcula correctamente un alquiler sin promociones", () => {
    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-22T00:00:00.000Z"),
      [],
      null,
      hoy
    );

    expect(resultado.dias).toBe(2);
    expect(resultado.subtotal).toBe(80);
    expect(resultado.descuento).toBe(0);
    expect(resultado.totalAlquiler).toBe(80);
    expect(resultado.garantia).toBe(20);
    expect(resultado.totalAPagar).toBe(100);
  });

  it("PF-02: considera un alquiler del mismo día como mínimo un día", () => {
    const dias = calcularDias(
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-20T00:00:00.000Z")
    );

    expect(dias).toBe(1);
  });

  it("PF-03: calcula la garantía como el 25% del alquiler", () => {
    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-22T00:00:00.000Z"),
      [],
      null,
      hoy
    );

    expect(PORCENTAJE_GARANTIA).toBe(25);
    expect(resultado.garantia).toBe(resultado.totalAlquiler * 0.25);
  });

  it("PF-04: normaliza un código promocional eliminando espacios y convirtiéndolo a mayúsculas", () => {
    expect(normalizarCodigo("  promo10  ")).toBe("PROMO10");
  });

  it("PF-05: devuelve null cuando el código promocional está vacío", () => {
    expect(normalizarCodigo("   ")).toBeNull();
  });

  it("PF-06: aplica una promoción automática del 10% al cumplir 3 días", () => {
    const promociones: Promocion[] = [
      {
        id: "promo-3-dias",
        nombre: "Alquila 3 días",
        descripcion: "10% de descuento desde 3 días",
        porcentaje: 10,
        activa: true,
        codigo: null,
        minDias: 3,
        diasSemana: [],
        tipoDisfraz: null,
        temporadaEvento: null,
        vigenteDesde: null,
        vigenteHasta: null,
        creadoEn: hoy,
      },
    ];

    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-23T00:00:00.000Z"),
      promociones,
      null,
      hoy
    );

    expect(resultado.dias).toBe(3);
    expect(resultado.subtotal).toBe(120);
    expect(resultado.descuento).toBe(12);
    expect(resultado.totalAlquiler).toBe(108);
    expect(resultado.garantia).toBe(27);
    expect(resultado.totalAPagar).toBe(135);
    expect(resultado.lineas[0].promocion?.id).toBe("promo-3-dias");
  });

  it("PF-07: no aplica una promoción cuando no se alcanza el mínimo de días", () => {
    const promociones: Promocion[] = [
      {
        id: "promo-3-dias",
        nombre: "Alquila 3 días",
        descripcion: "10% de descuento desde 3 días",
        porcentaje: 10,
        activa: true,
        codigo: null,
        minDias: 3,
        diasSemana: [],
        tipoDisfraz: null,
        temporadaEvento: null,
        vigenteDesde: null,
        vigenteHasta: null,
        creadoEn: hoy,
      },
    ];

    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-22T00:00:00.000Z"),
      promociones,
      null,
      hoy
    );

    expect(resultado.dias).toBe(2);
    expect(resultado.descuento).toBe(0);
    expect(resultado.totalAlquiler).toBe(80);
    expect(resultado.lineas[0].promocion).toBeNull();
  });

  it("PF-08: selecciona la promoción con mayor descuento y no acumula ofertas", () => {
    const promociones: Promocion[] = [
      {
        id: "promo-10",
        nombre: "Descuento 10%",
        descripcion: "10% de descuento desde 3 días",
        porcentaje: 10,
        activa: true,
        codigo: null,
        minDias: 3,
        diasSemana: [],
        tipoDisfraz: null,
        temporadaEvento: null,
        vigenteDesde: null,
        vigenteHasta: null,
        creadoEn: hoy,
      },
      {
        id: "promo-15",
        nombre: "Descuento 15%",
        descripcion: "15% de descuento desde 7 días",
        porcentaje: 15,
        activa: true,
        codigo: null,
        minDias: 7,
        diasSemana: [],
        tipoDisfraz: null,
        temporadaEvento: null,
        vigenteDesde: null,
        vigenteHasta: null,
        creadoEn: hoy,
      },
    ];

    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-27T00:00:00.000Z"),
      promociones,
      null,
      hoy
    );

    expect(resultado.dias).toBe(7);
    expect(resultado.subtotal).toBe(280);

    // Se aplica únicamente el 15%, no 10% + 15%.
    expect(resultado.descuento).toBe(42);
    expect(resultado.totalAlquiler).toBe(238);

    expect(resultado.lineas[0].promocion?.id).toBe("promo-15");
    expect(resultado.lineas[0].promocion?.porcentaje).toBe(15);
  });

  it("PF-09: aplica correctamente un código promocional válido", () => {
    const promociones: Promocion[] = [
      {
        id: "cupon-20",
        nombre: "Cupón especial",
        descripcion: "20% de descuento",
        porcentaje: 20,
        activa: true,
        codigo: "PROMO20",
        minDias: null,
        diasSemana: [],
        tipoDisfraz: null,
        temporadaEvento: null,
        vigenteDesde: null,
        vigenteHasta: null,
        creadoEn: hoy,
      },
    ];

    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-22T00:00:00.000Z"),
      promociones,
      "PROMO20",
      hoy
    );

    expect(resultado.subtotal).toBe(80);
    expect(resultado.descuento).toBe(16);
    expect(resultado.totalAlquiler).toBe(64);

    expect(resultado.codigo).toEqual({
      codigo: "PROMO20",
      valido: true,
      aplicado: true,
      mensaje: "Código PROMO20 aplicado: 20% de descuento.",
    });
  });

  it("PF-10: rechaza un código promocional inexistente", () => {
    const resultado = calcularCotizacion(
      [disfraz],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-22T00:00:00.000Z"),
      [],
      "NOEXISTE",
      hoy
    );

    expect(resultado.descuento).toBe(0);

    expect(resultado.codigo).toEqual({
      codigo: "NOEXISTE",
      valido: false,
      aplicado: false,
      mensaje: "El código no existe o ya no está vigente.",
    });
  });
});

// Casos complementarios de errores, fronteras y selección de promociones.
describe("Cotización: validación y reglas alternativas", () => {
  const fecha = new Date("2026-10-20T00:00:00Z"); // martes
  const d = { id: "d1", nombre: "Marinera", tipoDisfraz: "Tradicional", temporadaEvento: "Fiestas", precioAlquiler: 40 };
  const entrada = { disfraces: ["d1"], fechaInicio: "2026-10-20", fechaFin: "2026-10-22" };
  const promo = (cambios: Partial<Promocion> = {}): Promocion => ({
    id: "p1", nombre: "Oferta", descripcion: "Oferta de prueba", porcentaje: 10, activa: true, codigo: "CUPON",
    minDias: null, diasSemana: [], tipoDisfraz: null, temporadaEvento: null,
    vigenteDesde: null, vigenteHasta: null, creadoEn: fecha, ...cambios,
  });
  const calcular = (promos: Promocion[], codigo: string | null = "CUPON", disfraces = [d]) =>
    calcularCotizacion(disfraces, fecha, new Date("2026-10-22T00:00:00Z"), promos, codigo, fecha);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([]);
    vi.mocked(prisma.promocion.findMany).mockResolvedValue([]);
  });

  it.each([
    ["carrito vacío", { ...entrada, disfraces: [] }, /vacío/],
    ["duplicados", { ...entrada, disfraces: ["d1", "d1"] }, /repetidos/],
    ["inicio vacío", { ...entrada, fechaInicio: "" }, /inicio/],
    ["inicio inválido", { ...entrada, fechaInicio: "no-fecha" }, /inicio/],
    ["fin inválido", { ...entrada, fechaFin: "no-fecha" }, /fin/],
    ["fin anterior", { ...entrada, fechaFin: "2026-10-19" }, /anterior/],
  ])("rechaza %s sin consultar BD", async (_nombre, datos, mensaje) => {
    await expect(cotizar(datos)).rejects.toThrow(mensaje);
    expect(prisma.disfrazFisico.findMany).not.toHaveBeenCalled();
    expect(prisma.promocion.findMany).not.toHaveBeenCalled();
  });

  it("informa 404 si falta un disfraz y no consulta promociones", async () => {
    await expect(cotizar(entrada)).rejects.toMatchObject({ estado: 404 });
    expect(prisma.promocion.findMany).not.toHaveBeenCalled();
  });

  it("conserva el orden del carrito y normaliza el cupón antes de calcular", async () => {
    const d2 = { ...d, id: "d2", nombre: "Otro", precioAlquiler: 20 };
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([d2, d].map(item => ({
      ...item, precioAlquiler: new Prisma.Decimal(item.precioAlquiler), creadoEn: fecha,
      familia: null, grupoCompatibilidad: null, estadoManual: null,
      fechaSuspension: null, imagenUrl: null, origen: "CATALOGO" as const,
    })));
    vi.mocked(prisma.promocion.findMany).mockResolvedValue([promo()]);
    const r = await cotizar({ ...entrada, disfraces: ["d1", "d2"], codigo: "  cupon " });
    expect(r.lineas.map(l => l.disfrazId)).toEqual(["d1", "d2"]);
    expect(r.centavos).toMatchObject({ lineas: [7200, 3600], totalAlquiler: 10800, garantia: 2700, totalAPagar: 13500 });
    expect(r.codigo).toMatchObject({ codigo: "CUPON", valido: true, aplicado: true });
  });

  it("explica por qué el cupón no cumple los días mínimos", () => {
    const r = calcular([promo({ minDias: 3 })]);
    expect(r.codigo).toMatchObject({ valido: false, aplicado: false, mensaje: expect.stringContaining("al menos 3 días") });
    expect(r.descuento).toBe(0);
  });

  it("explica los días de semana admitidos cuando no coincide el inicio", () => {
    const r = calcular([promo({ diasSemana: [1, 5] })]);
    expect(r.codigo).toMatchObject({ valido: false, mensaje: expect.stringContaining("lunes o viernes") });
    expect(r.totalAlquiler).toBe(80);
  });

  it.each([
    [{ tipoDisfraz: "Superhéroe" }, "de tipo Superhéroe"],
    [{ temporadaEvento: "Halloween" }, "de la temporada Halloween"],
    [{ tipoDisfraz: "Superhéroe", temporadaEvento: "Halloween" }, " y "],
  ])("rechaza cupón que no cubre el carrito: %j", (condicion, mensaje) => {
    const r = calcular([promo(condicion)]);
    expect(r.codigo).toMatchObject({ valido: false, aplicado: false, mensaje: expect.stringContaining(mensaje) });
    expect(r.descuento).toBe(0);
  });

  it("acepta filtros de tipo/temporada sin distinguir mayúsculas y aplica parcialmente", () => {
    const r = calcular([promo({ tipoDisfraz: "tradicional", temporadaEvento: "FIESTAS" })], "CUPON", [d, { ...d, id: "d2", tipoDisfraz: "Otro" }]);
    expect(r.codigo).toMatchObject({ valido: true, aplicado: true, mensaje: expect.stringContaining("en 1 de 2 disfraces") });
    expect(r.lineas.map(l => l.descuento)).toEqual([8, 0]);
  });

  it("prefiere la automática si empata con cupón y no acumula descuentos", () => {
    const r = calcular([promo(), promo({ id: "auto", codigo: null })]);
    expect(r.lineas[0].promocion?.id).toBe("auto");
    expect(r.codigo).toMatchObject({ valido: true, aplicado: false });
    expect(r.descuento).toBe(8);
  });

  it("desempata ofertas por nombre de manera determinista", () => {
    const a = promo({ id: "a", codigo: null, nombre: "A" });
    const z = promo({ id: "z", codigo: null, nombre: "Z" });
    expect(calcular([z, a], null).lineas[0].promocion?.id).toBe("a");
    expect(calcular([a, z], null).lineas[0].promocion?.id).toBe("a");
  });

  it.each([
    { activa: false }, { vigenteDesde: new Date("2026-10-21Z") }, { vigenteHasta: new Date("2026-10-19Z") },
  ])("ignora cupón inactivo o fuera de vigencia: %j", cambios => {
    const r = calcular([promo(cambios)]);
    expect(r.codigo).toMatchObject({ valido: false, aplicado: false });
    expect(r.descuento).toBe(0);
  });

  it("incluye los extremos de vigencia y limita el detalle para metadata Stripe", () => {
    const r = calcular([promo({ nombre: "Oferta".repeat(120), vigenteDesde: fecha, vigenteHasta: fecha })]);
    expect(r.descuento).toBe(8);
    expect(r.detalleDescuento).toHaveLength(450);
    expect(r.detalleDescuento?.endsWith("…")).toBe(true);
  });

  it("lista solo ofertas vigentes y transforma sus campos públicos", async () => {
    vi.mocked(prisma.promocion.findMany).mockResolvedValue([
      promo({ codigo: null, vigenteHasta: new Date("2000-01-01Z") }),
      promo({ id: "vigente", codigo: null }),
      promo({ vigenteDesde: new Date("2100-01-01Z") }),
    ]);
    await expect(listarOfertasVigentes()).resolves.toEqual([
      { id: "vigente", nombre: "Oferta", descripcion: "Oferta de prueba", porcentaje: 10 },
    ]);
    expect(prisma.promocion.findMany).toHaveBeenCalledWith({ where: { activa: true, codigo: null }, orderBy: [{ porcentaje: "desc" }, { nombre: "asc" }] });
  });
});
