import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  devolucion: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },

  devolucionPrenda: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },

  alquilerDisfraz: {
    count: vi.fn(),
  },

  prenda: {
    update: vi.fn(),
  },

  $transaction: vi.fn(),
}));

const stripeMock = vi.hoisted(() => ({
  checkout: {
    sessions: {
      retrieve: vi.fn(),
    },
  },

  refunds: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/config/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = stripeMock.checkout;
    refunds = stripeMock.refunds;
  },
}));

import {
  corregirEstadoPrenda,
  ErrorGarantia,
  resolverGarantia,
} from "../../src/modules/devoluciones/garantia.service";

describe("Pruebas funcionales - Garantía", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("PF-36: rechaza corregir una prenda que no pertenece a la devolución", async () => {
    prismaMock.devolucionPrenda.findFirst.mockResolvedValue(null);

    await expect(
      corregirEstadoPrenda(
        "devolucion-1",
        "prenda-1",
        "DANADA"
      )
    ).rejects.toMatchObject({
      message: "Esa prenda no pertenece a esta devolución.",
      estado: 404,
    });
  });

  it("PF-37: impide modificar prendas cuando la garantía ya fue resuelta", async () => {
    prismaMock.devolucionPrenda.findFirst.mockResolvedValue({
      id: "detalle-1",

      estadoPrenda: "BUEN_ESTADO",

      devolucion: {
        garantiaEstado: "DEVUELTA",
      },

      prenda: {
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
    });

    await expect(
      corregirEstadoPrenda(
        "devolucion-1",
        "prenda-1",
        "DANADA"
      )
    ).rejects.toMatchObject({
      message:
        "La garantía ya fue resuelta: no se puede cambiar el estado de las prendas.",
      estado: 409,
    });
  });

  it("PF-38: impide cambiar físicamente una prenda cuyo disfraz volvió a ser alquilado", async () => {
    prismaMock.devolucionPrenda.findFirst.mockResolvedValue({
      id: "detalle-1",

      estadoPrenda: "BUEN_ESTADO",

      devolucion: {
        garantiaEstado: "PENDIENTE",
      },

      prenda: {
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
    });

    prismaMock.alquilerDisfraz.count.mockResolvedValue(1);

    await expect(
      corregirEstadoPrenda(
        "devolucion-1",
        "prenda-1",
        "DANADA"
      )
    ).rejects.toMatchObject({
      message:
        "Esa prenda pertenece a un disfraz que ya está alquilado de nuevo: no se puede cambiar su estado físico.",
      estado: 409,
    });
  });

  it("PF-39: permite corregir una prenda a DANADA cuando la garantía está pendiente", async () => {
    prismaMock.devolucionPrenda.findFirst.mockResolvedValue({
      id: "detalle-1",

      estadoPrenda: "BUEN_ESTADO",

      devolucion: {
        garantiaEstado: "PENDIENTE",
      },

      prenda: {
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
    });

    prismaMock.alquilerDisfraz.count.mockResolvedValue(0);

    prismaMock.devolucion.findUnique.mockResolvedValue({
      id: "devolucion-1",
      garantiaEstado: "PENDIENTE",
    });

    await corregirEstadoPrenda(
      "devolucion-1",
      "prenda-1",
      "DANADA",
      "Prenda dañada durante el alquiler"
    );

    expect(
      prismaMock.devolucionPrenda.update
    ).toHaveBeenCalledWith({
      where: {
        id: "detalle-1",
      },

      data: {
        estadoAdmin: "DANADA",
        observacion:
          "Prenda dañada durante el alquiler",
      },
    });

    expect(
      prismaMock.prenda.update
    ).toHaveBeenCalledWith({
      where: {
        id: "prenda-1",
      },

      data: {
        estado: "DANADA",
      },
    });
  });

  it("PF-40: una prenda corregida a BUEN_ESTADO vuelve al estado físico DISPONIBLE", async () => {
    prismaMock.devolucionPrenda.findFirst.mockResolvedValue({
      id: "detalle-1",

      estadoPrenda: "DANADA",

      devolucion: {
        garantiaEstado: "PENDIENTE",
      },

      prenda: {
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
    });

    prismaMock.alquilerDisfraz.count.mockResolvedValue(0);

    prismaMock.devolucion.findUnique.mockResolvedValue({
      id: "devolucion-1",
      garantiaEstado: "PENDIENTE",
    });

    await corregirEstadoPrenda(
      "devolucion-1",
      "prenda-1",
      "BUEN_ESTADO"
    );

    expect(
      prismaMock.prenda.update
    ).toHaveBeenCalledWith({
      where: {
        id: "prenda-1",
      },

      data: {
        estado: "DISPONIBLE",
      },
    });
  });

  it("PF-41: rechaza resolver una garantía cuando la devolución no existe", async () => {
    prismaMock.devolucion.findUnique.mockResolvedValue(null);

    await expect(
      resolverGarantia(
        "devolucion-inexistente",
        "DEVOLVER",
        undefined,
        "admin-1"
      )
    ).rejects.toMatchObject({
      message: "Devolución no encontrada",
      estado: 404,
    });
  });

  it("PF-42: rechaza resolver nuevamente una garantía que ya fue cerrada", async () => {
    prismaMock.devolucion.findUnique.mockResolvedValue({
      id: "devolucion-1",

      garantiaEstado: "RETENIDA",

      alquiler: {
        id: "alquiler-1",
        montoGarantia: 25,
        stripeSessionId: null,
      },
    });

    await expect(
      resolverGarantia(
        "devolucion-1",
        "DEVOLVER",
        undefined,
        "admin-1"
      )
    ).rejects.toMatchObject({
      message:
        "La garantía de esta devolución ya fue resuelta.",
      estado: 409,
    });
  });

  it("PF-43: permite retener la garantía registrando monto y motivo", async () => {
    prismaMock.devolucion.findUnique
      .mockResolvedValueOnce({
        id: "devolucion-1",

        garantiaEstado: "PENDIENTE",

        alquiler: {
          id: "alquiler-1",
          montoGarantia: 25,
          stripeSessionId: null,
        },
      })
      .mockResolvedValueOnce({
        id: "devolucion-1",
        garantiaEstado: "RETENIDA",
      });

    prismaMock.devolucion.updateMany.mockResolvedValue({
      count: 1,
    });

    const resultado = await resolverGarantia(
      "devolucion-1",
      "RETENER",
      "  Prenda dañada  ",
      "admin-1"
    );

    expect(
      prismaMock.devolucion.updateMany
    ).toHaveBeenCalledWith({
      where: {
        id: "devolucion-1",
        garantiaEstado: "PENDIENTE",
      },

      data: expect.objectContaining({
        garantiaEstado: "RETENIDA",
        garantiaMonto: 25,
        garantiaMotivo: "Prenda dañada",
        garantiaReembolsoId: null,
        garantiaResueltaPorId: "admin-1",
        garantiaResueltaEn: expect.any(Date),
      }),
    });

    expect(resultado).toEqual({
      id: "devolucion-1",
      garantiaEstado: "RETENIDA",
    });
  });

  it("PF-44: devuelve en mostrador una garantía de un alquiler sin Stripe", async () => {
    prismaMock.devolucion.findUnique
      .mockResolvedValueOnce({
        id: "devolucion-1",

        garantiaEstado: "PENDIENTE",

        alquiler: {
          id: "alquiler-1",
          montoGarantia: 20,
          stripeSessionId: null,
        },
      })
      .mockResolvedValueOnce({
        id: "devolucion-1",
        garantiaEstado: "DEVUELTA",
      });

    prismaMock.devolucion.updateMany.mockResolvedValue({
      count: 1,
    });

    await resolverGarantia(
      "devolucion-1",
      "DEVOLVER",
      undefined,
      "admin-1"
    );

    expect(
      prismaMock.devolucion.updateMany
    ).toHaveBeenCalledWith({
      where: {
        id: "devolucion-1",
        garantiaEstado: "PENDIENTE",
      },

      data: expect.objectContaining({
        garantiaEstado: "DEVUELTA",
        garantiaMonto: 20,
        garantiaMotivo: null,
        garantiaReembolsoId: null,
      }),
    });

    expect(
      stripeMock.checkout.sessions.retrieve
    ).not.toHaveBeenCalled();

    expect(
      stripeMock.refunds.create
    ).not.toHaveBeenCalled();
  });

  it("PF-45: devuelve la garantía mediante Stripe cuando el alquiler posee una sesión de pago", async () => {
    prismaMock.devolucion.findUnique
      .mockResolvedValueOnce({
        id: "devolucion-1",

        garantiaEstado: "PENDIENTE",

        alquiler: {
          id: "alquiler-1",
          montoGarantia: 30,
          stripeSessionId: "cs_test_123",
        },
      })
      .mockResolvedValueOnce({
        id: "devolucion-1",
        garantiaEstado: "DEVUELTA",
      });

    prismaMock.devolucion.updateMany.mockResolvedValue({
      count: 1,
    });

    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      payment_intent: "pi_test_123",
    });

    stripeMock.refunds.list.mockResolvedValue({
      data: [],
    });

    stripeMock.refunds.create.mockResolvedValue({
      id: "re_test_123",
    });

    await resolverGarantia(
      "devolucion-1",
      "DEVOLVER",
      undefined,
      "admin-1"
    );

    expect(
      stripeMock.refunds.create
    ).toHaveBeenCalledWith(
      {
        payment_intent: "pi_test_123",
        amount: 3000,
        reason: "requested_by_customer",

        metadata: {
          devolucionId: "devolucion-1",
          alquilerId: "alquiler-1",
          concepto: "garantia",
        },
      },

      {
        idempotencyKey:
          "garantia-devolucion-1",
      }
    );

    expect(
      prismaMock.devolucion.updateMany
    ).toHaveBeenCalledWith({
      where: {
        id: "devolucion-1",
        garantiaEstado: "PENDIENTE",
      },

      data: expect.objectContaining({
        garantiaEstado: "DEVUELTA",
        garantiaMonto: 30,
        garantiaReembolsoId: "re_test_123",
      }),
    });
  });
});