import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  disfrazFisico: {
    findUnique: vi.fn(),
  },

  reserva: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },

  prenda: {
    findMany: vi.fn(),
  },

  $transaction: vi.fn(),
}));

const disfracesMock = vi.hoisted(() => ({
  disfracesNoDisponibles: vi.fn(),
  estadosDeDisfraces: vi.fn(),
}));

const reservasMock = vi.hoisted(() => ({
  liberarReservasVencidas: vi.fn(),
}));

vi.mock("../../src/config/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/modules/disfraces/disfraces.service", () => ({
  disfracesNoDisponibles:
    disfracesMock.disfracesNoDisponibles,

  estadosDeDisfraces:
    disfracesMock.estadosDeDisfraces,
}));

vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  MINUTOS_RESERVA_INICIAL: 15,

  liberarReservasVencidas:
    reservasMock.liberarReservasVencidas,
}));

vi.mock("../../src/modules/a-medida/reservas.service", () => ({
  MAX_RESERVAS_SIN_PAGAR: 3,
}));

import {
  elegirIntercambios,
  infoAjuste,
  previsualizarAjuste,
  reservarAjuste,
  validarTallasPrendas,
} from "../../src/modules/ajuste-talla/ajuste.service";

describe("Pruebas funcionales - Ajuste de talla", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    reservasMock.liberarReservasVencidas.mockResolvedValue(
      undefined
    );

    disfracesMock.disfracesNoDisponibles.mockResolvedValue(
      []
    );

    disfracesMock.estadosDeDisfraces.mockResolvedValue(
      []
    );

    prismaMock.reserva.findFirst.mockResolvedValue(null);
    prismaMock.reserva.findMany.mockResolvedValue([]);
    prismaMock.reserva.count.mockResolvedValue(0);
    prismaMock.prenda.findMany.mockResolvedValue([]);
  });

  it("PF-72: exige talla de ropa cuando el disfraz contiene prendas de ropa ajustables", () => {
    const prendas = [
      {
        id: "camisa-1",
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "M",
      },
    ];

    const errores = validarTallasPrendas(
      prendas,
      {} as any
    );

    expect(errores).toContain(
      "Indica tu talla de ropa."
    );
  });

  it("PF-73: exige talla de calzado cuando el disfraz contiene zapatos ajustables", () => {
    const prendas = [
      {
        id: "zapato-1",
        nombre: "Zapato",
        tipo: "ZAPATO",
        color: "negro",
        talla: "40",
      },
    ];

    const errores = validarTallasPrendas(
      prendas,
      {} as any
    );

    expect(errores).toContain(
      "Indica tu talla de calzado."
    );
  });

  it("PF-74: rechaza un ajuste asociado a una prenda que no pertenece al disfraz", () => {
    const prendas = [
      {
        id: "camisa-1",
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "M",
      },
    ];

    const errores = validarTallasPrendas(
      prendas,
      {
        ropa: "M",

        ajustes: {
          "prenda-inexistente": "L",
        },
      } as any
    );

    expect(errores).toContain(
      "Hay un ajuste de talla para una pieza que no está en este disfraz."
    );
  });

    it("PF-75: una prenda de talla única no admite ajuste individual", () => {
    const prendas = [
        {
        id: "panuelo-1",
        nombre: "Pañuelo",
        tipo: "PANUELO",
        color: "rojo",
        talla: "única",
        },
    ];

    const errores = validarTallasPrendas(
        prendas,
        {
        ajustes: {
            "panuelo-1": "M",
        },
        } as any
    );

    expect(errores).toContain(
        "«Pañuelo» es de talla única: no admite ajuste."
    );
    });

  it("PF-76: mantiene una pieza cuando la talla solicitada coincide con la original", () => {
    const resultado = elegirIntercambios({
      familia: "Pirata",

      prendas: [
        {
          id: "camisa-1",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
        },
      ],

      tallas: {
        ropa: "M",
      },

      donantes: [],
    });

    expect(resultado.completo).toBe(true);
    expect(resultado.intercambios).toHaveLength(0);
    expect(resultado.faltantes).toHaveLength(0);

    expect(resultado.piezas[0]).toMatchObject({
      prendaId: "camisa-1",
      talla: "M",
      tallaOriginal: "M",
      cambia: false,
    });
  });

  it("PF-77: utiliza una pieza equivalente del almacén cuando existe la talla solicitada", () => {
    const resultado = elegirIntercambios({
      familia: "Pirata",

      prendas: [
        {
          id: "camisa-original",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
        },
      ],

      tallas: {
        ropa: "L",
      },

      donantes: [
        {
          id: "camisa-donante",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "L",
          origen: "ALMACEN",
          disfrazId: "almacen",
          disfrazNombre: "Almacén",
          familia: null,
        },
      ],
    });

    expect(resultado.completo).toBe(true);
    expect(resultado.intercambios).toHaveLength(1);

    expect(resultado.intercambios[0]).toMatchObject({
      original: {
        id: "camisa-original",
      },

      donante: {
        id: "camisa-donante",
        origen: "ALMACEN",
      },
    });

    expect(resultado.piezas[0]).toMatchObject({
      talla: "L",
      tallaOriginal: "M",
      cambia: true,
    });
  });

  it("PF-78: puede utilizar una pieza de otro disfraz de la misma familia", () => {
    const resultado = elegirIntercambios({
      familia: "Pirata",

      prendas: [
        {
          id: "camisa-original",
          nombre: "Camisa Pirata",
          tipo: "CAMISA",
          color: "blanco",
          talla: "M",
        },
      ],

      tallas: {
        ropa: "L",
      },

      donantes: [
        {
          id: "camisa-familia",
          nombre: "Camisa Pirata",
          tipo: "CAMISA",
          color: "blanco",
          talla: "L",
          origen: "DISFRAZ",
          disfrazId: "pirata-2",
          disfrazNombre: "Pirata #2",
          familia: "Pirata",
        },
      ],
    });

    expect(resultado.completo).toBe(true);
    expect(resultado.intercambios).toHaveLength(1);

    expect(
      resultado.intercambios[0].donante.id
    ).toBe("camisa-familia");
  });

  it("PF-79: informa la pieza faltante cuando no existe una talla equivalente", () => {
    const resultado = elegirIntercambios({
      familia: "Pirata",

      prendas: [
        {
          id: "camisa-1",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
        },
      ],

      tallas: {
        ropa: "XL",
      },

      donantes: [],
    });

    expect(resultado.completo).toBe(false);
    expect(resultado.intercambios).toHaveLength(0);
    expect(resultado.faltantes).toHaveLength(1);

    expect(resultado.faltantes[0]).toMatchObject({
      prendaId: "camisa-1",
      nombre: "Camisa",
      tallaPedida: "XL",
    });

    expect(
      resultado.faltantes[0].tallasDisponibles
    ).toContain("M");
  });

  it("PF-80: infoAjuste indica si el disfraz requiere talla de ropa y calzado", async () => {
    prismaMock.disfrazFisico.findUnique.mockResolvedValue({
      id: "disfraz-1",
      nombre: "Pirata",
      familia: "Pirata",
      origen: "CATALOGO",
      tipoDisfraz: "Pirata",
      precioAlquiler: 40,

      prendasActuales: [
        {
          id: "camisa-1",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
          estado: "DISPONIBLE",
        },

        {
          id: "zapato-1",
          nombre: "Zapato",
          tipo: "ZAPATO",
          color: "negro",
          talla: "40",
          estado: "DISPONIBLE",
        },

        {
          id: "sombrero-1",
          nombre: "Sombrero",
          tipo: "SOMBRERO",
          color: "negro",
          talla: "UNICA",
          estado: "DISPONIBLE",
        },
      ],
    });

    const resultado = await infoAjuste(
      "disfraz-1",
      "usuario-1"
    );

    expect(resultado).toMatchObject({
      disfraz: {
        id: "disfraz-1",
        nombre: "Pirata",
        precioDia: 40,
      },

      ajustable: true,
      motivo: null,
      pideTallaRopa: true,
      pideTallaCalzado: true,
    });

    expect(resultado.piezas).toHaveLength(3);
  });

  it("PF-81: previsualiza correctamente un cambio de talla usando un donante disponible", async () => {
    prismaMock.disfrazFisico.findUnique.mockResolvedValue({
      id: "disfraz-1",
      nombre: "Pirata",
      familia: "Pirata",
      origen: "CATALOGO",
      tipoDisfraz: "Pirata",
      precioAlquiler: 40,

      prendasActuales: [
        {
          id: "camisa-original",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
          estado: "DISPONIBLE",
        },
      ],
    });

    prismaMock.prenda.findMany.mockResolvedValue([
      {
        id: "camisa-donante",
        nombre: "Camisa",
        tipo: "CAMISA",
        color: "rojo",
        talla: "L",

        disfrazHogarId: "almacen-1",
        disfrazActualId: "almacen-1",

        disfrazHogar: {
          id: "almacen-1",
          nombre: "Almacén",
          origen: "ALMACEN",
          familia: null,
        },
      },
    ]);

    const resultado = await previsualizarAjuste(
      "disfraz-1",
      {
        ropa: "L",
      },
      "usuario-1"
    );

    expect(resultado).toMatchObject({
      disfraz: {
        id: "disfraz-1",
        nombre: "Pirata",
        precioDia: 40,
      },

      completo: true,
      cambios: 1,
    });

    expect(resultado.piezas[0]).toMatchObject({
      prendaId: "camisa-original",
      talla: "L",
      tallaOriginal: "M",
      cambia: true,
    });
  });

  it("PF-82: rechaza previsualizar cuando el usuario ya tiene reservado el mismo disfraz", async () => {
    prismaMock.disfrazFisico.findUnique.mockResolvedValue({
      id: "disfraz-1",
      nombre: "Pirata",
      familia: "Pirata",
      origen: "CATALOGO",
      tipoDisfraz: "Pirata",
      precioAlquiler: 40,

      prendasActuales: [
        {
          id: "camisa-1",
          nombre: "Camisa",
          tipo: "CAMISA",
          color: "rojo",
          talla: "M",
          estado: "DISPONIBLE",
        },
      ],
    });

    prismaMock.reserva.findFirst.mockResolvedValue({
      id: "reserva-1",
    });

    await expect(
      previsualizarAjuste(
        "disfraz-1",
        {
          ropa: "L",
        },
        "usuario-1"
      )
    ).rejects.toMatchObject({
      estado: 409,

      message:
        "Ya tienes este disfraz reservado con tus tallas. Págalo o cancela la reserva para cambiarlas.",
    });
  });

  it("PF-83: impide crear más ajustes cuando se alcanzó el máximo de reservas sin pagar", async () => {
    prismaMock.reserva.count.mockResolvedValue(3);

    await expect(
      reservarAjuste(
        "disfraz-1",
        {
          ropa: "L",
        },
        "usuario-1"
      )
    ).rejects.toMatchObject({
      estado: 409,

      message:
        "Ya tienes 3 disfraces reservados sin pagar. Paga o cancela alguno antes de reservar otro.",
    });

    expect(
      prismaMock.disfrazFisico.findUnique
    ).not.toHaveBeenCalled();
  });
});