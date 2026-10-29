import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    proveedor: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    prendaProveedor: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../../src/config/prisma";

import {
  crearProveedor,
  listarProveedores,
  asociarPrenda,
} from "../../src/modules/proveedores/proveedores.service";

describe("ProveedoresService - gestión de proveedores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PF-PRO-01: crea un proveedor con los datos recibidos", async () => {
    const datos = {
      nombre: "Textiles Lima",
      telefono: "999999999",
      email: "ventas@textiles.test",
    };

    vi.mocked(prisma.proveedor.create).mockResolvedValue({
      id: "proveedor-1",
      ...datos,
    } as any);

    const resultado = await crearProveedor(datos as any);

    expect(prisma.proveedor.create).toHaveBeenCalledWith({
      data: datos,
    });

    expect(resultado).toMatchObject({
      id: "proveedor-1",
      nombre: "Textiles Lima",
    });
  });

  it("PF-PRO-02: lista proveedores con sus prendas y ordenados desde el más reciente", async () => {
    vi.mocked(prisma.proveedor.findMany).mockResolvedValue([] as any);

    await listarProveedores();

    expect(prisma.proveedor.findMany).toHaveBeenCalledWith({
      include: {
        prendas: {
          include: {
            prenda: true,
          },
        },
      },
      orderBy: {
        creadoEn: "desc",
      },
    });
  });

  it("PF-PRO-03: asocia una prenda con un proveedor y devuelve ambas relaciones", async () => {
    vi.mocked(prisma.prendaProveedor.create).mockResolvedValue({
      proveedorId: "proveedor-1",
      prendaId: "prenda-1",
    } as any);

    await asociarPrenda(
      "proveedor-1",
      "prenda-1"
    );

    expect(prisma.prendaProveedor.create).toHaveBeenCalledWith({
      data: {
        proveedorId: "proveedor-1",
        prendaId: "prenda-1",
      },
      include: {
        prenda: true,
        proveedor: true,
      },
    });
  });
});