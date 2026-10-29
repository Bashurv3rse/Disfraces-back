import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  disfrazFisico: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },

  prenda: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },

  $transaction: vi.fn(),
}));

const reservasMock = vi.hoisted(() => ({
  liberarReservasVencidas: vi.fn(),
}));

vi.mock("../../src/config/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  liberarReservasVencidas:
    reservasMock.liberarReservasVencidas,
}));

import {
  agregarPiezas,
  ErrorAlmacen,
  listarAlmacen,
  retirarPiezas,
} from "../../src/modules/almacen/almacen.service";

describe("Pruebas funcionales - Almacén", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    reservasMock.liberarReservasVencidas.mockResolvedValue(
      undefined
    );

    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("PF-64: devuelve el almacén vacío cuando todavía no existe", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue(
      null
    );

    const resultado = await listarAlmacen();

    expect(resultado).toEqual({
      resumen: {
        total: 0,
        disponibles: 0,
        enUso: 0,
        danadas: 0,
      },

      grupos: [],
    });

    expect(
      reservasMock.liberarReservasVencidas
    ).toHaveBeenCalledTimes(1);
  });

  it("PF-65: clasifica correctamente piezas disponibles, en uso y dañadas", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue({
      id: "almacen-1",
    });

    prismaMock.prenda.findMany.mockResolvedValue([
      {
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazActualId: "almacen-1",
      },

      {
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "M",
        estado: "DANADA",
        disfrazActualId: "almacen-1",
      },

      {
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "L",
        estado: "DISPONIBLE",
        disfrazActualId: "disfraz-1",
      },
    ]);

    const resultado = await listarAlmacen();

    expect(resultado.resumen).toEqual({
      total: 3,
      disponibles: 1,
      enUso: 1,
      danadas: 1,
    });

    expect(resultado.grupos).toHaveLength(1);

    expect(
      resultado.grupos[0].totalDisponibles
    ).toBe(1);

    expect(
      resultado.grupos[0].tallas
        .reduce(
          (total, talla) =>
            total + talla.total,
          0
        )
    ).toBe(3);
  });

  it("PF-66: agrupa piezas equivalentes sin distinguir mayúsculas en nombre y color", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue({
      id: "almacen-1",
    });

    prismaMock.prenda.findMany.mockResolvedValue([
      {
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "Rojo",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazActualId: "almacen-1",
      },

      {
        nombre: "CAMISA",
        tipo: "CAMISA",
        color: "ROJO",
        talla: "L",
        estado: "DISPONIBLE",
        disfrazActualId: "almacen-1",
      },
    ]);

    const resultado = await listarAlmacen();

    expect(resultado.grupos).toHaveLength(1);

    expect(resultado.grupos[0]).toMatchObject({
      tipo: "CAMISA",
      totalDisponibles: 2,
    });

    expect(resultado.grupos[0].tallas).toHaveLength(2);
  });

  it("PF-67: crea automáticamente el almacén al agregar la primera pieza", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue(
      null
    );

    prismaMock.disfrazFisico.create.mockResolvedValue({
      id: "almacen-nuevo",
      origen: "ALMACEN",
    });

    prismaMock.prenda.findFirst.mockResolvedValue(
      null
    );

    prismaMock.prenda.createMany.mockResolvedValue({
      count: 2,
    });

    const resultado = await agregarPiezas({
      nombre: "Camisa",
      tipo: "CAMISA",
      color: "Rojo",

      tallas: [
        {
          talla: "M",
          cantidad: 2,
        },
      ],
    } as any);

    expect(
      prismaMock.disfrazFisico.create
    ).toHaveBeenCalledWith({
      data: {
        nombre: "Almacén de piezas sueltas",
        tipoDisfraz: "Almacén",
        temporadaEvento: "almacen",
        precioAlquiler: 0,
        origen: "ALMACEN",
      },
    });

    expect(resultado).toEqual({
      agregadas: 2,
    });
  });

  it("PF-68: agrega la cantidad solicitada de piezas y normaliza el color", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue({
      id: "almacen-1",
      origen: "ALMACEN",
    });

    prismaMock.prenda.findFirst.mockResolvedValue(
      null
    );

    prismaMock.prenda.createMany.mockResolvedValue({
      count: 3,
    });

    const resultado = await agregarPiezas({
      nombre: "Camisa",
      tipo: "CAMISA",
      color: "  ROJO  ",

      tallas: [
        {
          talla: "M",
          cantidad: 2,
        },
        {
          talla: "L",
          cantidad: 1,
        },
      ],
    } as any);

    expect(
      prismaMock.prenda.createMany
    ).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
          disfrazHogarId: "almacen-1",
          disfrazActualId: "almacen-1",
        }),

        expect.objectContaining({
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "L",
          disfrazHogarId: "almacen-1",
          disfrazActualId: "almacen-1",
        }),
      ]),
    });

    const llamada =
      prismaMock.prenda.createMany.mock.calls[0][0];

    expect(llamada.data).toHaveLength(3);

    expect(resultado).toEqual({
      agregadas: 3,
    });
  });

  it("PF-69: rechaza retirar piezas cuando el almacén todavía no existe", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue(
      null
    );

    await expect(
      retirarPiezas({
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "M",
        cantidad: 1,
      } as any)
    ).rejects.toMatchObject({
      message:
        "El almacén todavía no tiene piezas.",
      estado: 404,
    });
  });

  it("PF-70: elimina físicamente una pieza sin historial al retirarla del almacén", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue({
      id: "almacen-1",
    });

    prismaMock.prenda.findMany.mockResolvedValue([
      {
        id: "prenda-1",
        estado: "DISPONIBLE",
        calidad: "alta",
        disfrazActualId: "almacen-1",

        _count: {
          movimientos: 0,
          devolucionItems: 0,
          proveedores: 0,
          sustitucionesSalida: 0,
        },
      },
    ]);

    prismaMock.prenda.deleteMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.prenda.updateMany.mockResolvedValue({
      count: 0,
    });

    const resultado = await retirarPiezas({
      nombre: "Camisa",
      tipo: "CAMISA",
      color: "rojo",
      talla: "M",
      cantidad: 1,
    } as any);

    expect(
      prismaMock.prenda.deleteMany
    ).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["prenda-1"],
        },
      },
    });

    expect(resultado).toEqual({
      solicitadas: 1,
      retiradas: 1,
      eliminadas: 1,
      deBaja: 0,
    });
  });

  it("PF-71: conserva el historial dando de baja una pieza que ya participó en movimientos", async () => {
    prismaMock.disfrazFisico.findFirst.mockResolvedValue({
      id: "almacen-1",
    });

    prismaMock.prenda.findMany.mockResolvedValue([
      {
        id: "prenda-historial",
        estado: "DISPONIBLE",
        calidad: "alta",
        disfrazActualId: "almacen-1",

        _count: {
          movimientos: 1,
          devolucionItems: 0,
          proveedores: 0,
          sustitucionesSalida: 0,
        },
      },
    ]);

    prismaMock.prenda.deleteMany.mockResolvedValue({
      count: 0,
    });

    prismaMock.prenda.updateMany.mockResolvedValue({
      count: 1,
    });

    const resultado = await retirarPiezas({
      nombre: "Camisa",
      tipo: "CAMISA",
      color: "rojo",
      talla: "M",
      cantidad: 1,
    } as any);

    expect(
      prismaMock.prenda.updateMany
    ).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["prenda-historial"],
        },
      },

      data: {
        estado: "DANADA",
        calidad: "baja",
      },
    });

    expect(resultado).toEqual({
      solicitadas: 1,
      retiradas: 1,
      eliminadas: 0,
      deBaja: 1,
    });
  });
});