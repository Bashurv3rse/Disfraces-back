import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  reserva: { findMany: vi.fn() },
}));
vi.mock("../../src/config/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  liberarReservasVencidas: vi.fn(),
  desarmarReservasTerminadas: vi.fn(),
  obtenerReservadosIds: vi.fn(),
}));

import * as service from "../../src/modules/disfraces/disfraces.service";

// limpiarSuspensionesVencidas consulta a Prisma: se sustituye por un mock mínimo.
(prismaMock as any).disfrazFisico = { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() };

const reserva = (disfrazExtra: object, id = "d1") => ({
  tallaRopa: "L",
  tallaCalzado: "38",
  usuario: { nombre: "Ana", email: "ana@test.com" },
  disfrazFisico: {
    id, nombre: "A medida: Pirata", tipoDisfraz: "A medida", estadoManual: null, fechaSuspension: null,
    prendasActuales: [{ id: "p1", nombre: "Camisa", tipo: "CAMISA", color: "blanco", talla: "L", disfrazHogar: { nombre: "Almacén" } }],
    alquileres: [],
    ...disfrazExtra,
  },
});

beforeEach(() => vi.clearAllMocks());

describe("disfraces a medida temporales", () => {
  it("un alquiler abierto se informa como ALQUILADO con sus fechas", async () => {
    prismaMock.reserva.findMany.mockResolvedValue([
      reserva({ alquileres: [{ alquiler: { estado: "ACTIVO", fechaInicio: new Date("2026-11-16"), fechaFin: new Date("2026-11-18") } }] }),
    ]);
    const [t] = await service.listarATemporales();
    expect(t.estado).toBe("ALQUILADO");
    expect(t.fechaFin).toEqual(new Date("2026-11-18"));
    expect(t.prendas[0].origen).toBe("Almacén");
  });

  it("sin alquiler abierto y con marca de lavado se informa EN_LAVADO", async () => {
    prismaMock.reserva.findMany.mockResolvedValue([
      reserva({ estadoManual: "SUSPENDIDO", fechaSuspension: new Date() }),
    ]);
    const [t] = await service.listarATemporales();
    expect(t.estado).toBe("EN_LAVADO");
    expect(t.lavadoHasta).toBeInstanceOf(Date);
  });

  it("solo pide reservas a medida confirmadas y sin liberar (las desarmadas desaparecen)", async () => {
    prismaMock.reserva.findMany.mockResolvedValue([]);
    expect(await service.listarATemporales()).toEqual([]);
    expect(prismaMock.reserva.findMany.mock.calls[0][0].where).toMatchObject({
      tipo: "A_MEDIDA", liberadaEn: null, confirmadaEn: { not: null },
    });
  });
});
