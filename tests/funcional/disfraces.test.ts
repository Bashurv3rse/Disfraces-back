import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  disfrazFisico: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },

  alquilerDisfraz: {
    findMany: vi.fn(),
  },

  movimientoPrenda: {
    count: vi.fn(),
  },

  prenda: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },

  sustitucion: {
    create: vi.fn(),
  },
}));

const reservasMock = vi.hoisted(() => ({
  liberarReservasVencidas: vi.fn(),
  desarmarReservasTerminadas: vi.fn(),
  obtenerReservadosIds: vi.fn(),
}));

vi.mock("../../src/config/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  liberarReservasVencidas:
    reservasMock.liberarReservasVencidas,

  desarmarReservasTerminadas:
    reservasMock.desarmarReservasTerminadas,

  obtenerReservadosIds:
    reservasMock.obtenerReservadosIds,
}));

import {
  actualizarEstadoManual,
  actualizarPrenda,
  devolverPrestamo,
  estadosDeDisfraces,
  fechaLiberacionLavado,
} from "../../src/modules/disfraces/disfraces.service";

describe("Pruebas funcionales - Disfraces e inventario", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    reservasMock.liberarReservasVencidas.mockResolvedValue(
      undefined
    );

    reservasMock.desarmarReservasTerminadas.mockResolvedValue(
      undefined
    );

    reservasMock.obtenerReservadosIds.mockResolvedValue(
      new Set()
    );

    prismaMock.disfrazFisico.findMany.mockResolvedValue([]);
    prismaMock.disfrazFisico.updateMany.mockResolvedValue({
      count: 0,
    });

    prismaMock.alquilerDisfraz.findMany.mockResolvedValue([]);
    prismaMock.movimientoPrenda.count.mockResolvedValue(0);
  });

  it("PF-54: el lavado termina después de tres días hábiles ignorando el fin de semana", () => {
    const viernes = new Date(
      Date.UTC(2026, 9, 23)
    );

    const liberacion =
      fechaLiberacionLavado(viernes);

    expect(
      liberacion.toISOString().slice(0, 10)
    ).toBe("2026-10-28");
  });

  it("PF-55: un disfraz completo y libre se considera DISPONIBLE", async () => {
    prismaMock.disfrazFisico.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "disfraz-1",
          nombre: "Pirata",
          familia: "Pirata",
          origen: "CATALOGO",
          estadoManual: null,
          fechaSuspension: null,

          prendasHogar: [
            {
              tipo: "CAMISA",
              disfrazActualId: "disfraz-1",
            },
            {
              tipo: "PANTALON",
              disfrazActualId: "disfraz-1",
            },
          ],

          prendasActuales: [
            {
              tipo: "CAMISA",
              estado: "DISPONIBLE",
            },
            {
              tipo: "PANTALON",
              estado: "DISPONIBLE",
            },
          ],
        },
      ]);

    const resultado =
      await estadosDeDisfraces([
        "disfraz-1",
      ]);

    expect(resultado).toEqual([
      expect.objectContaining({
        id: "disfraz-1",
        nombre: "Pirata",
        estado: "DISPONIBLE",
      }),
    ]);
  });

  it("PF-56: un disfraz con una prenda faltante se considera INCOMPLETO", async () => {
    prismaMock.disfrazFisico.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "disfraz-1",
          nombre: "Pirata",
          familia: "Pirata",
          origen: "CATALOGO",
          estadoManual: null,
          fechaSuspension: null,

          prendasHogar: [
            {
              tipo: "CAMISA",
              disfrazActualId: "disfraz-1",
            },
            {
              tipo: "PANTALON",
              disfrazActualId: "disfraz-1",
            },
          ],

          prendasActuales: [
            {
              tipo: "CAMISA",
              estado: "DISPONIBLE",
            },
            {
              tipo: "PANTALON",
              estado: "FALTANTE",
            },
          ],
        },
      ]);

    const resultado =
      await estadosDeDisfraces([
        "disfraz-1",
      ]);

    expect(resultado[0].estado).toBe(
      "INCOMPLETO"
    );
  });

  it("PF-57: un disfraz perteneciente a un alquiler activo se considera ALQUILADO", async () => {
    prismaMock.disfrazFisico.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "disfraz-1",
          nombre: "Pirata",
          familia: "Pirata",
          origen: "CATALOGO",
          estadoManual: null,
          fechaSuspension: null,

          prendasHogar: [
            {
              tipo: "CAMISA",
              disfrazActualId: "disfraz-1",
            },
          ],

          prendasActuales: [
            {
              tipo: "CAMISA",
              estado: "DISPONIBLE",
            },
          ],
        },
      ]);

    prismaMock.alquilerDisfraz.findMany.mockResolvedValue([
      {
        disfrazFisicoId: "disfraz-1",
      },
    ]);

    const resultado =
      await estadosDeDisfraces([
        "disfraz-1",
      ]);

    expect(resultado[0].estado).toBe(
      "ALQUILADO"
    );
  });

  it("PF-58: un disfraz con una reserva vigente se considera RESERVADO", async () => {
    prismaMock.disfrazFisico.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "disfraz-1",
          nombre: "Pirata",
          familia: "Pirata",
          origen: "CATALOGO",
          estadoManual: null,
          fechaSuspension: null,

          prendasHogar: [
            {
              tipo: "CAMISA",
              disfrazActualId: "disfraz-1",
            },
          ],

          prendasActuales: [
            {
              tipo: "CAMISA",
              estado: "DISPONIBLE",
            },
          ],
        },
      ]);

    reservasMock.obtenerReservadosIds.mockResolvedValue(
      new Set(["disfraz-1"])
    );

    const resultado =
      await estadosDeDisfraces([
        "disfraz-1",
      ]);

    expect(resultado[0].estado).toBe(
      "RESERVADO"
    );
  });

  it("PF-59: impide cambiar el estado manual de un disfraz alquilado", async () => {
    prismaMock.alquilerDisfraz.findMany.mockResolvedValue([
      {
        disfrazFisicoId: "disfraz-1",
      },
    ]);

    await expect(
      actualizarEstadoManual(
        "disfraz-1",
        "EN_REPARACION"
      )
    ).rejects.toThrow(
      "Este disfraz está alquilado — no se puede modificar hasta que se devuelva."
    );

    expect(
      prismaMock.disfrazFisico.update
    ).not.toHaveBeenCalled();
  });

  it("PF-60: impide modificar una prenda cuando su disfraz está alquilado", async () => {
    prismaMock.prenda.findUnique.mockResolvedValue({
      id: "prenda-1",
      disfrazHogarId: "disfraz-1",
      disfrazActualId: "disfraz-1",
    });

    prismaMock.alquilerDisfraz.findMany.mockResolvedValue([
      {
        disfrazFisicoId: "disfraz-1",
      },
    ]);

    await expect(
      actualizarPrenda(
        "prenda-1",
        {
          estado: "DANADA",
        }
      )
    ).rejects.toThrow(
      "Este disfraz está alquilado — no se puede modificar hasta que se devuelva."
    );

    expect(
      prismaMock.prenda.update
    ).not.toHaveBeenCalled();
  });

  it("PF-61: permite actualizar una prenda libre que no está apartada", async () => {
    prismaMock.prenda.findUnique.mockResolvedValue({
      id: "prenda-1",
      disfrazHogarId: "disfraz-1",
      disfrazActualId: "disfraz-1",
    });

    prismaMock.alquilerDisfraz.findMany.mockResolvedValue(
      []
    );

    prismaMock.movimientoPrenda.count.mockResolvedValue(
      0
    );

    prismaMock.prenda.update.mockResolvedValue({
      id: "prenda-1",
      estado: "DANADA",
      calidad: "REGULAR",
    });

    const resultado =
      await actualizarPrenda(
        "prenda-1",
        {
          estado: "DANADA",
          calidad: "REGULAR",
        }
      );

    expect(
      prismaMock.prenda.update
    ).toHaveBeenCalledWith({
      where: {
        id: "prenda-1",
      },

      data: {
        estado: "DANADA",
        calidad: "REGULAR",
      },
    });

    expect(resultado).toMatchObject({
      id: "prenda-1",
      estado: "DANADA",
      calidad: "REGULAR",
    });
  });

  it("PF-62: rechaza devolver una prenda que ya está en su disfraz de origen", async () => {
    prismaMock.prenda.findUnique.mockResolvedValue({
      id: "prenda-1",
      nombre: "Camisa",
      estado: "DISPONIBLE",
      disfrazHogarId: "disfraz-1",
      disfrazActualId: "disfraz-1",
    });

    await expect(
      devolverPrestamo("prenda-1")
    ).rejects.toThrow(
      "Esta prenda no está prestada: ya está en su disfraz de origen."
    );

    expect(
      prismaMock.prenda.update
    ).not.toHaveBeenCalled();
  });

  it("PF-63: rechaza devolver una prenda prestada que está dañada", async () => {
    prismaMock.prenda.findUnique.mockResolvedValue({
      id: "prenda-1",
      nombre: "Camisa",
      estado: "DANADA",
      disfrazHogarId: "disfraz-origen",
      disfrazActualId: "disfraz-destino",
    });

    await expect(
      devolverPrestamo("prenda-1")
    ).rejects.toThrow(
      "Solo se puede devolver una prenda en buen estado."
    );

    expect(
      prismaMock.prenda.update
    ).not.toHaveBeenCalled();
  });
});