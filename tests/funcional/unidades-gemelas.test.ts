import { beforeEach, describe, expect, it, vi } from "vitest";

const unidades: any[] = [];
const alquileres: any[] = [];

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findMany: vi.fn(async (args: any) => {
        const w = args?.where ?? {};
        if (w.id?.in) return unidades.filter((u) => w.id.in.includes(u.id));
        if (w.familia?.in) return unidades.filter((u) => w.familia.in.includes(u.familia) && u.origen === w.origen);
        return [];
      }),
      updateMany: vi.fn(),
    },
    alquilerDisfraz: { findMany: vi.fn(async () => alquileres) },
  },
}));
vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  desarmarReservasTerminadas: vi.fn(),
  liberarReservasVencidas: vi.fn(),
  obtenerReservadosIds: vi.fn(async () => new Set<string>()),
}));

import { disponibilidadDeDisfraces } from "../../src/modules/disfraces/disfraces.service";

const unidad = (id: string, nombre: string, ropa = "M", calzado = "40") => ({
  id,
  nombre,
  familia: "Batman",
  origen: "CATALOGO",
  estadoManual: null,
  fechaSuspension: null,
  prendasHogar: [
    { id: `${id}-a`, tipo: "CAMISA", talla: ropa, color: "negro" },
    { id: `${id}-b`, tipo: "ZAPATO", talla: calzado, color: "negro" },
  ],
  prendasActuales: [
    { id: `${id}-a`, tipo: "CAMISA", talla: ropa, estado: "DISPONIBLE" },
    { id: `${id}-b`, tipo: "ZAPATO", talla: calzado, estado: "DISPONIBLE" },
  ],
});

const rango = { inicio: new Date("2027-03-10T00:00:00Z"), fin: new Date("2027-03-12T00:00:00Z") };

describe("unidades idénticas (PF-BE-GEM)", () => {
  beforeEach(() => {
    unidades.length = 0;
    alquileres.length = 0;
  });

  it("si la unidad está alquilada en esas fechas ofrece una gemela libre", async () => {
    unidades.push(unidad("a", "Batman #1"), unidad("b", "Batman #33"));
    alquileres.push({ disfrazFisicoId: "a", alquiler: { fechaInicio: rango.inicio, fechaFin: rango.fin, estado: "ACTIVO" } });
    const r = await disponibilidadDeDisfraces(["a"], rango);
    expect(r[0].disponible).toBe(false);
    expect(r[0].reemplazo).toEqual({ id: "b", nombre: "Batman #33" });
  });

  it("no ofrece gemela si tiene otras tallas", async () => {
    unidades.push(unidad("a", "Batman #1"), unidad("c", "Batman #2", "L", "40"));
    alquileres.push({ disfrazFisicoId: "a", alquiler: { fechaInicio: rango.inicio, fechaFin: rango.fin, estado: "ACTIVO" } });
    const r = await disponibilidadDeDisfraces(["a"], rango);
    expect(r[0].reemplazo).toBeNull();
  });

  it("no ofrece gemela si también está ocupada", async () => {
    unidades.push(unidad("a", "Batman #1"), unidad("b", "Batman #33"));
    for (const id of ["a", "b"])
      alquileres.push({ disfrazFisicoId: id, alquiler: { fechaInicio: rango.inicio, fechaFin: rango.fin, estado: "ACTIVO" } });
    const r = await disponibilidadDeDisfraces(["a"], rango);
    expect(r[0].reemplazo).toBeNull();
  });

  it("una unidad libre no necesita reemplazo", async () => {
    unidades.push(unidad("a", "Batman #1"), unidad("b", "Batman #33"));
    const r = await disponibilidadDeDisfraces(["a"], rango);
    expect(r[0].disponible).toBe(true);
    expect(r[0].reemplazo).toBeNull();
  });
});
