import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),

  alquiler: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },

  alquilerDisfraz: {
    findMany: vi.fn(),
  },

  devolucion: {
    count: vi.fn(),
  },

  disfrazFisico: {
    findMany: vi.fn(),
  },
}));

const cotizarMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/config/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/pagos/precios.service", () => ({
  cotizar: cotizarMock,
}));

import {
  crearAlquiler,
  listarPropios,
  listarTodos,
  resumenAdmin,
} from "../../src/modules/alquileres/alquileres.service";

describe("Pruebas funcionales - Alquileres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PF-46: crea un alquiler utilizando los precios calculados por la cotización", async () => {
    cotizarMock.mockResolvedValue({
      totalAlquiler: 120,
      garantia: 30,
      descuento: 12,
      detalleDescuento: "Descuento automático 10%",
      lineas: [
        {
          disfrazId: "disfraz-1",
          precioDia: 40,
        },
      ],
    });

    const tx = {
      alquiler: {
        create: vi.fn().mockResolvedValue({
          id: "alquiler-1",
          estado: "ACTIVO",
          montoTotal: 120,
          montoGarantia: 30,
        }),
      },

      reserva: {
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
    };

    prismaMock.$transaction.mockImplementation(
    async (callback: (transaction: any) => unknown) =>
        callback(tx)
    );

    const resultado = await crearAlquiler(
      {
        fechaInicio: "2026-10-25",
        fechaFin: "2026-10-27",
        evento: "Fiesta",
        disfraces: ["disfraz-1"],
      } as any,
      "usuario-1"
    );

    expect(tx.alquiler.create).toHaveBeenCalledWith({
      data: {
        usuarioId: "usuario-1",
        fechaInicio: new Date("2026-10-25"),
        fechaFin: new Date("2026-10-27"),
        evento: "Fiesta",
        estado: "ACTIVO",
        montoTotal: 120,
        montoGarantia: 30,
        descuento: 12,
        detalleDescuento: "Descuento automático 10%",
        stripeSessionId: undefined,

        disfraces: {
          create: [
            {
              disfrazFisicoId: "disfraz-1",
              precioUnitario: 40,
            },
          ],
        },
      },

      include: {
        disfraces: {
          include: {
            disfrazFisico: true,
          },
        },
      },
    });

    expect(resultado).toMatchObject({
      id: "alquiler-1",
      estado: "ACTIVO",
      montoTotal: 120,
      montoGarantia: 30,
    });
  });

  it("PF-47: conserva exactamente los precios recibidos desde el flujo de pago", async () => {
    cotizarMock.mockResolvedValue({
      totalAlquiler: 100,
      garantia: 25,
      descuento: 0,
      detalleDescuento: null,

      lineas: [
        {
          disfrazId: "disfraz-1",
          precioDia: 50,
        },
      ],
    });

    const tx = {
      alquiler: {
        create: vi.fn().mockResolvedValue({
          id: "alquiler-1",
        }),
      },

      reserva: {
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
    };

    prismaMock.$transaction.mockImplementation(
    async (callback: (transaction: any) => unknown) =>
        callback(tx)
    );

    await crearAlquiler(
      {
        fechaInicio: "2026-10-25",
        fechaFin: "2026-10-26",
        evento: "Evento",
        disfraces: ["disfraz-1"],
      } as any,

      "usuario-1",

      {
        stripeSessionId: "cs_test_123",

        precios: {
          montoTotal: 80,
          montoGarantia: 20,
          descuento: 20,
          detalleDescuento: "PROMO20",
        },
      }
    );

    expect(tx.alquiler.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          montoTotal: 80,
          montoGarantia: 20,
          descuento: 20,
          detalleDescuento: "PROMO20",
          stripeSessionId: "cs_test_123",
        }),
      })
    );
  });

  it("PF-48: confirma las reservas a medida antes de crear el alquiler", async () => {
    cotizarMock.mockResolvedValue({
      totalAlquiler: 50,
      garantia: 12.5,
      descuento: 0,
      detalleDescuento: null,

      lineas: [
        {
          disfrazId: "disfraz-1",
          precioDia: 50,
        },
      ],
    });

    const tx = {
      alquiler: {
        create: vi.fn().mockResolvedValue({
          id: "alquiler-1",
        }),
      },

      reserva: {
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),

        findFirst: vi.fn(),
      },
    };

    prismaMock.$transaction.mockImplementation(
    async (callback: (transaction: any) => unknown) =>
        callback(tx)
    );

    await crearAlquiler(
      {
        fechaInicio: "2026-10-25",
        fechaFin: "2026-10-25",
        evento: "Evento",
        disfraces: ["disfraz-1"],
      } as any,

      "usuario-1",

      {
        reservasIds: ["reserva-1"],
      }
    );

    expect(tx.reserva.updateMany).toHaveBeenCalledWith({
      where: {
        id: "reserva-1",
        usuarioId: "usuario-1",
        liberadaEn: null,
        confirmadaEn: null,
      },

      data: {
        confirmadaEn: expect.any(Date),
      },
    });

    expect(tx.alquiler.create).toHaveBeenCalledTimes(1);
  });

  it("PF-49: permite continuar si una reserva ya había sido confirmada previamente", async () => {
    cotizarMock.mockResolvedValue({
      totalAlquiler: 50,
      garantia: 12.5,
      descuento: 0,
      detalleDescuento: null,

      lineas: [
        {
          disfrazId: "disfraz-1",
          precioDia: 50,
        },
      ],
    });

    const tx = {
      alquiler: {
        create: vi.fn().mockResolvedValue({
          id: "alquiler-1",
        }),
      },

      reserva: {
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),

        findFirst: vi.fn().mockResolvedValue({
          id: "reserva-1",
        }),
      },
    };

    prismaMock.$transaction.mockImplementation(
    async (callback: (transaction: any) => unknown) =>
        callback(tx)
    );

    await expect(
      crearAlquiler(
        {
          fechaInicio: "2026-10-25",
          fechaFin: "2026-10-25",
          evento: "Evento",
          disfraces: ["disfraz-1"],
        } as any,

        "usuario-1",

        {
          reservasIds: ["reserva-1"],
        }
      )
    ).resolves.toMatchObject({
      id: "alquiler-1",
    });

    expect(tx.reserva.findFirst).toHaveBeenCalled();
    expect(tx.alquiler.create).toHaveBeenCalledTimes(1);
  });

  it("PF-50: rechaza crear el alquiler cuando una reserva ya no está disponible", async () => {
    cotizarMock.mockResolvedValue({
      totalAlquiler: 50,
      garantia: 12.5,
      descuento: 0,
      detalleDescuento: null,

      lineas: [
        {
          disfrazId: "disfraz-1",
          precioDia: 50,
        },
      ],
    });

    const tx = {
      alquiler: {
        create: vi.fn(),
      },

      reserva: {
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),

        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    prismaMock.$transaction.mockImplementation(
    async (callback: (transaction: any) => unknown) =>
        callback(tx)
    );
    
    await expect(
      crearAlquiler(
        {
          fechaInicio: "2026-10-25",
          fechaFin: "2026-10-25",
          evento: "Evento",
          disfraces: ["disfraz-1"],
        } as any,

        "usuario-1",

        {
          reservasIds: ["reserva-perdida"],
        }
      )
    ).rejects.toBeTruthy();

    expect(tx.alquiler.create).not.toHaveBeenCalled();
  });

  it("PF-51: listarPropios consulta únicamente los alquileres del usuario", async () => {
    prismaMock.alquiler.findMany.mockResolvedValue([]);

    await listarPropios("usuario-1");

    expect(prismaMock.alquiler.findMany).toHaveBeenCalledWith({
      where: {
        usuarioId: "usuario-1",
      },

      include: {
        disfraces: {
          include: {
            disfrazFisico: {
              include: {
                prendasActuales: true,
              },
            },
          },
        },

        devolucion: {
          select: {
            fechaDevolucion: true,
            garantiaEstado: true,
            garantiaMonto: true,
            garantiaMotivo: true,
            garantiaReembolsoId: true,
            garantiaResueltaEn: true,

            prendas: {
              select: {
                estadoPrenda: true,
                estadoAdmin: true,
                observacion: true,

                prenda: {
                  select: {
                    id: true,
                    nombre: true,
                    color: true,
                    talla: true,
                  },
                },
              },
            },
          },
        },
      },

      orderBy: {
        creadoEn: "desc",
      },
    });
  });

  it("PF-52: listarTodos solicita los alquileres con información del cliente", async () => {
    prismaMock.alquiler.findMany.mockResolvedValue([]);

    await listarTodos();

    expect(prismaMock.alquiler.findMany).toHaveBeenCalledWith({
      include: {
        disfraces: {
          include: {
            disfrazFisico: true,
          },
        },

        usuario: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },

      orderBy: {
        creadoEn: "desc",
      },
    });
  });

  it("PF-53: el resumen administrativo calcula ingresos y métricas principales", async () => {
    const ahora = new Date();

    prismaMock.alquiler.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    prismaMock.alquiler.findMany
      .mockResolvedValueOnce([
        {
          montoTotal: 100,
        },
        {
          montoTotal: 50,
        },
      ])
      .mockResolvedValueOnce([
        {
          usuario: {
            nombre: "Cliente Prueba",
          },

          montoTotal: 75,
          estado: "ACTIVO",
        },
      ])
      .mockResolvedValueOnce([
        {
          creadoEn: ahora,
          montoTotal: 100,
        },
      ])
      .mockResolvedValueOnce([
        {
          creadoEn: ahora,
        },
      ]);

    prismaMock.alquilerDisfraz.findMany.mockResolvedValue([
      {
        disfrazFisico: {
          tipoDisfraz: "Pirata",
        },
      },
      {
        disfrazFisico: {
          tipoDisfraz: "Pirata",
        },
      },
      {
        disfrazFisico: {
          tipoDisfraz: "Princesa",
        },
      },
    ]);

    prismaMock.devolucion.count.mockResolvedValue(2);

    prismaMock.disfrazFisico.findMany.mockResolvedValue([
      {
        id: "disfraz-1",
        nombre: "Pirata",

        prendasHogar: [
          {
            disfrazActualId: "disfraz-1",
            estado: "DISPONIBLE",
          },
        ],
      },

      {
        id: "disfraz-2",
        nombre: "Princesa",

        prendasHogar: [
          {
            disfrazActualId: "otro-disfraz",
            estado: "DISPONIBLE",
          },
        ],
      },
    ]);

    const resultado = await resumenAdmin();

    expect(resultado.totalAlquileres).toBe(10);
    expect(resultado.alquileresActivos).toBe(3);
    expect(resultado.alquileresProximos).toBe(2);
    expect(resultado.ingresosMes).toBe(150);
    expect(resultado.devolucionesPendientes).toBe(2);

    expect(resultado.ultimosAlquileres).toEqual([
      {
        cliente: "Cliente Prueba",
        monto: 75,
        estado: "activo",
      },
    ]);

    expect(resultado.porCategoria).toEqual(
      expect.arrayContaining([
        {
          categoria: "Pirata",
          valor: 2,
        },
        {
          categoria: "Princesa",
          valor: 1,
        },
      ])
    );

    expect(resultado.alertasStock).toEqual([
      {
        nombre: "Princesa",
        detalle:
          "Disfraz incompleto — falta reponer prenda(s)",
        unidades: 0,
      },
    ]);
  });
});