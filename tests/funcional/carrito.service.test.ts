import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findMany: vi.fn(),
    },
    reserva: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  liberarReservasVencidas: vi.fn(),
}));

vi.mock("../../src/modules/a-medida/reservas.service", () => ({
  extenderReserva: vi.fn(),
}));

import { prisma } from "../../src/config/prisma";
import { liberarReservasVencidas } from "../../src/modules/a-medida/reservas.base";
import { extenderReserva } from "../../src/modules/a-medida/reservas.service";

import {
  prepararCarrito,
  extenderReservasDelCarrito,
  validarSoloCatalogo,
} from "../../src/modules/pagos/carrito.service";

describe("CarritoService - validación del carrito", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(liberarReservasVencidas).mockResolvedValue(undefined as any);
    vi.mocked(extenderReserva).mockResolvedValue(undefined as any);

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "disfraz-1",
        nombre: "Bombero",
        origen: "CATALOGO",
      },
    ] as any);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([] as any);
  });

  it("PF-CAR-01: libera reservas vencidas antes de preparar el carrito", async () => {
    await prepararCarrito(["disfraz-1"], "usuario-1");

    expect(liberarReservasVencidas).toHaveBeenCalledTimes(1);
  });

  it("PF-CAR-02: rechaza el carrito cuando alguno de los disfraces ya no existe", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([] as any);

    await expect(
      prepararCarrito(["disfraz-1"], "usuario-1")
    ).rejects.toMatchObject({
      estado: 409,
    });
  });

  it("PF-CAR-03: rechaza artículos internos del almacén", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "almacen-1",
        nombre: "Almacén",
        origen: "ALMACEN",
      },
    ] as any);

    await expect(
      prepararCarrito(["almacen-1"], "usuario-1")
    ).rejects.toMatchObject({
      estado: 400,
    });
  });

  it("PF-CAR-04: permite disfraces normales del catálogo sin exigir una reserva", async () => {
    const resultado = await prepararCarrito(
      ["disfraz-1"],
      "usuario-1"
    );

    expect(resultado).toEqual({
      reservas: [],
    });
  });

  it("PF-CAR-05: exige una reserva vigente del usuario para un disfraz a medida", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "medida-1",
        nombre: "Bombero a medida",
        origen: "A_MEDIDA",
      },
    ] as any);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([] as any);

    await expect(
      prepararCarrito(["medida-1"], "usuario-1")
    ).rejects.toMatchObject({
      estado: 409,
    });
  });

  it("PF-CAR-06: devuelve las reservas vigentes del carrito con sus segundos restantes", async () => {
    const vence = new Date(Date.now() + 60_000);

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "medida-1",
        nombre: "Bombero a medida",
        origen: "A_MEDIDA",
      },
    ] as any);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([
      {
        id: "reserva-1",
        tipo: "A_MEDIDA",
        disfrazFisicoId: "medida-1",
        vence,
      },
    ] as any);

    const resultado = await prepararCarrito(
      ["medida-1"],
      "usuario-1"
    );

    expect(resultado.reservas).toHaveLength(1);

    expect(resultado.reservas[0]).toMatchObject({
      reservaId: "reserva-1",
      disfrazId: "medida-1",
      tipo: "A_MEDIDA",
      vence,
    });

    expect(resultado.reservas[0].segundosRestantes).toBeGreaterThanOrEqual(0);
  });

  it("PF-CAR-07: extiende todas las reservas del carrito antes del pago", async () => {
    const vence = new Date();

    await extenderReservasDelCarrito(
      [
        {
          reservaId: "reserva-1",
          disfrazId: "d1",
          tipo: "A_MEDIDA",
          vence,
          segundosRestantes: 100,
        },
        {
          reservaId: "reserva-2",
          disfrazId: "d2",
          tipo: "AJUSTE_TALLA",
          vence,
          segundosRestantes: 100,
        },
      ],
      "usuario-1"
    );

    expect(extenderReserva).toHaveBeenCalledTimes(2);
    expect(extenderReserva).toHaveBeenNthCalledWith(
      1,
      "reserva-1",
      "usuario-1"
    );
    expect(extenderReserva).toHaveBeenNthCalledWith(
      2,
      "reserva-2",
      "usuario-1"
    );
  });

  it("PF-CAR-08: rechaza alquiler directo cuando alguno de los disfraces no existe", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([] as any);

    await expect(
      validarSoloCatalogo(["inexistente"])
    ).rejects.toMatchObject({
      estado: 404,
    });
  });

  it("PF-CAR-09: rechaza alquiler directo de disfraces que no pertenecen al catálogo", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "medida-1",
        origen: "A_MEDIDA",
      },
    ] as any);

    await expect(
      validarSoloCatalogo(["medida-1"])
    ).rejects.toMatchObject({
      estado: 400,
    });
  });

  it("PF-CAR-10: permite alquiler directo cuando todos los disfraces pertenecen al catálogo", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "d1",
        origen: "CATALOGO",
      },
      {
        id: "d2",
        origen: "CATALOGO",
      },
    ] as any);

    await expect(
      validarSoloCatalogo(["d1", "d2"])
    ).resolves.toBeUndefined();
  });
});