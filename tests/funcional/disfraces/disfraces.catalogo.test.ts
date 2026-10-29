import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// MOCKS
// ============================================================

const cryptoMocks = vi.hoisted(() => ({
  randomUUID: vi.fn(),
}));

vi.mock("crypto", () => ({
  randomUUID: cryptoMocks.randomUUID,
}));

vi.mock("../../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    prenda: {
      createMany: vi.fn(),
    },
    alquilerDisfraz: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock(
  "../../../src/modules/a-medida/reservas.base",
  () => ({
    desarmarReservasTerminadas: vi.fn(),
    liberarReservasVencidas: vi.fn(),
    obtenerReservadosIds: vi.fn(),
  })
);

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../../src/config/prisma";

import {
  desarmarReservasTerminadas,
  liberarReservasVencidas,
  obtenerReservadosIds,
} from "../../../src/modules/a-medida/reservas.base";

import {
  ErrorDisfraz,
  crearDisfraz,
  infoLavado,
  fechaLiberacionLavado,
  limpiarSuspensionesVencidas,
  listarDisfraces,
  obtenerDisfrazConEstado,
  disfracesNoDisponibles,
  estadosDeDisfraces,
  obtenerTemporadasDisponibles,
  obtenerTiposDisponibles,
} from "../../../src/modules/disfraces/disfraces.service";

// ============================================================
// HELPERS
// ============================================================

function disfrazBase(overrides: Record<string, any> = {}) {
  return {
    id: "disfraz-1",
    nombre: "Batman",
    familia: "Batman",
    grupoCompatibilidad: "batman",
    tipoDisfraz: "SUPERHEROE",
    temporadaEvento: "HALLOWEEN",
    precioAlquiler: 50,
    imagenUrl: null,
    origen: "CATALOGO",

    estadoManual: null,
    fechaSuspension: null,

    creadoEn: new Date("2026-01-01"),

    prendasHogar: [
      {
        id: "prenda-1",
        nombre: "Capa",
        tipo: "CAPA",
        color: "NEGRO",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
      {
        id: "prenda-2",
        nombre: "Máscara",
        tipo: "MASCARA",
        color: "NEGRO",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
    ],

    prendasActuales: [
      {
        id: "prenda-1",
        nombre: "Capa",
        tipo: "CAPA",
        color: "NEGRO",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
      {
        id: "prenda-2",
        nombre: "Máscara",
        tipo: "MASCARA",
        color: "NEGRO",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazHogarId: "disfraz-1",
        disfrazActualId: "disfraz-1",
      },
    ],

    ...overrides,
  };
}

function configurarLimpiezaVacia() {
  vi.mocked(
    liberarReservasVencidas
  ).mockResolvedValue(undefined as any);

  vi.mocked(
    desarmarReservasTerminadas
  ).mockResolvedValue(undefined as any);

  vi.mocked(
    prisma.disfrazFisico.findMany
  ).mockResolvedValueOnce([] as any);
}

function configurarEstados(
  alquilados: string[] = [],
  reservados: string[] = []
) {
  vi.mocked(prisma.alquilerDisfraz.findMany).mockResolvedValue(
    alquilados.map((id) => ({
      disfrazFisicoId: id,
    })) as any
  );

  vi.mocked(obtenerReservadosIds).mockResolvedValue(
    new Set(reservados) as any
  );
}

// ============================================================
// TESTS
// ============================================================

describe("DisfracesService - catálogo y estados", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    cryptoMocks.randomUUID
      .mockReturnValueOnce("disfraz-generado-1")
      .mockReturnValue("uuid-test-12345678");

    vi.mocked(
      liberarReservasVencidas
    ).mockResolvedValue(undefined as any);

    vi.mocked(
      desarmarReservasTerminadas
    ).mockResolvedValue(undefined as any);

    vi.mocked(obtenerReservadosIds).mockResolvedValue(
      new Set() as any
    );

    vi.mocked(prisma.alquilerDisfraz.findMany).mockResolvedValue(
      [] as any
    );

    vi.mocked(prisma.disfrazFisico.updateMany).mockResolvedValue({
      count: 0,
    } as any);

    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);
  });

  // ==========================================================
  // CREACIÓN
  // ==========================================================

  it("PF-DIS-CAT-01: rechaza la creación cuando ya existe un disfraz con el mismo nombre", async () => {
    vi.mocked(prisma.disfrazFisico.findFirst).mockResolvedValue({
      id: "existente",
    } as any);

    await expect(
      crearDisfraz({
        nombre: "Batman",
        familia: "Batman",
        grupoCompatibilidad: "batman",
        tipoDisfraz: "SUPERHEROE",
        temporadaEvento: "HALLOWEEN",
        precioAlquiler: 50,
        imagenUrl: null,
        prendas: [],
      } as any)
    ).rejects.toMatchObject({
      message: 'Ya existe un disfraz llamado "Batman".',
      estado: 409,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("PF-DIS-CAT-02: rechaza un grupo incompatible con el grupo existente de la familia", async () => {
    vi.mocked(prisma.disfrazFisico.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        familia: "Batman",
        grupoCompatibilidad: "grupo-batman",
      } as any);

    await expect(
      crearDisfraz({
        nombre: "Batman #2",
        familia: "Batman",
        grupoCompatibilidad: "otro-grupo",
        tipoDisfraz: "SUPERHEROE",
        temporadaEvento: "HALLOWEEN",
        precioAlquiler: 50,
        imagenUrl: null,
        prendas: [],
      } as any)
    ).rejects.toMatchObject({
      estado: 409,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("PF-DIS-CAT-03: reutiliza familia y grupo de compatibilidad de un disfraz hermano", async () => {
    vi.mocked(prisma.disfrazFisico.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        familia: "Batman",
        grupoCompatibilidad: "grupo-batman",
      } as any);

    vi.mocked(prisma.disfrazFisico.create).mockResolvedValue(
      {} as any
    );

    vi.mocked(prisma.prenda.createMany).mockResolvedValue({
      count: 1,
    } as any);

    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

    // obtenerDisfrazConEstado ejecutado al final de crearDisfraz:
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findUnique).mockResolvedValue(
      disfrazBase({
        id: "disfraz-generado-1",
        familia: "Batman",
        grupoCompatibilidad: "grupo-batman",
      }) as any
    );

    configurarEstados();

    await crearDisfraz({
      nombre: "Batman #2",
      familia: "batman",
      tipoDisfraz: "SUPERHEROE",
      temporadaEvento: "HALLOWEEN",
      precioAlquiler: 50,
      imagenUrl: null,
      prendas: [
        {
          nombre: "Capa",
          tipo: "CAPA",
          color: "NEGRO",
          talla: "M",
        },
      ],
    } as any);

    expect(prisma.disfrazFisico.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nombre: "Batman #2",
        familia: "Batman",
        grupoCompatibilidad: "grupo-batman",
      }),
    });
  });

  it("PF-DIS-CAT-04: deriva la familia quitando el sufijo numérico y genera un grupo slug", async () => {
    vi.mocked(prisma.disfrazFisico.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    vi.mocked(prisma.disfrazFisico.create).mockResolvedValue(
      {} as any
    );

    vi.mocked(prisma.prenda.createMany).mockResolvedValue({
      count: 1,
    } as any);

    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findUnique).mockResolvedValue(
      disfrazBase({
        id: "disfraz-generado-1",
        nombre: "Héroe Águila #2",
        familia: "Héroe Águila",
        grupoCompatibilidad: "heroe-aguila",
      }) as any
    );

    configurarEstados();

    await crearDisfraz({
      nombre: "Héroe Águila #2",
      tipoDisfraz: "SUPERHEROE",
      temporadaEvento: "HALLOWEEN",
      precioAlquiler: 40,
      imagenUrl: null,
      prendas: [
        {
          nombre: "Capa",
          tipo: "CAPA",
          color: "ROJO",
          talla: "M",
        },
      ],
    } as any);

    expect(prisma.disfrazFisico.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familia: "Héroe Águila",
        grupoCompatibilidad: "heroe-aguila",
      }),
    });
  });

  it("PF-DIS-CAT-05: crea disfraz y prendas dentro de una misma transacción", async () => {
    vi.mocked(prisma.disfrazFisico.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    vi.mocked(prisma.disfrazFisico.create).mockResolvedValue(
      {} as any
    );

    vi.mocked(prisma.prenda.createMany).mockResolvedValue({
      count: 2,
    } as any);

    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findUnique).mockResolvedValue(
      disfrazBase({
        id: "disfraz-generado-1",
      }) as any
    );

    configurarEstados();

    await crearDisfraz({
      nombre: "Batman",
      familia: "Batman",
      grupoCompatibilidad: "batman",
      tipoDisfraz: "SUPERHEROE",
      temporadaEvento: "HALLOWEEN",
      precioAlquiler: 50,
      imagenUrl: "batman.jpg",
      prendas: [
        {
          nombre: "Capa",
          tipo: "CAPA",
          color: "NEGRO",
          talla: "M",
        },
        {
          nombre: "Máscara",
          tipo: "MASCARA",
          color: "NEGRO",
          talla: "M",
        },
      ],
    } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(prisma.prenda.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          nombre: "Capa",
          disfrazHogarId: "disfraz-generado-1",
          disfrazActualId: "disfraz-generado-1",
        }),
      ]),
    });
  });

  // ==========================================================
  // LAVADO
  // ==========================================================

  it("PF-DIS-CAT-06: informa fase LAVADO durante el día inicial", () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-10-26T12:00:00.000Z")
    );

    const resultado = infoLavado(
      new Date("2026-10-26T08:00:00.000Z")
    );

    expect(resultado).toEqual({
      dias: 0,
      fase: "LAVADO",
    });

    vi.useRealTimers();
  });

  it("PF-DIS-CAT-07: avanza por PLANCHADO y EMPAQUETADO según días hábiles", () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-10-28T12:00:00.000Z")
    );

    expect(
      infoLavado(new Date("2026-10-27T08:00:00.000Z"))
    ).toEqual({
      dias: 1,
      fase: "PLANCHADO",
    });

    expect(
      infoLavado(new Date("2026-10-26T08:00:00.000Z"))
    ).toEqual({
      dias: 2,
      fase: "EMPAQUETADO",
    });

    vi.useRealTimers();
  });

  it("PF-DIS-CAT-08: finaliza el lavado después de tres días hábiles", () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-10-29T12:00:00.000Z")
    );

    const resultado = infoLavado(
      new Date("2026-10-26T08:00:00.000Z")
    );

    expect(resultado.dias).toBe(3);
    expect(resultado.fase).toBeNull();

    vi.useRealTimers();
  });

  it("PF-DIS-CAT-09: calcula la liberación ignorando sábado y domingo", () => {
    const resultado = fechaLiberacionLavado(
      new Date("2026-10-23T10:00:00.000Z")
    );

    // Viernes + 3 días hábiles = miércoles.
    expect(resultado.toISOString()).toBe(
      "2026-10-28T00:00:00.000Z"
    );
  });

  // ==========================================================
  // LIMPIEZA AUTOMÁTICA
  // ==========================================================

  it("PF-DIS-CAT-10: libera reservas vencidas y desarma reservas terminadas", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue(
      [] as any
    );

    await limpiarSuspensionesVencidas();

    expect(liberarReservasVencidas).toHaveBeenCalledTimes(1);
    expect(desarmarReservasTerminadas).toHaveBeenCalledTimes(1);

    expect(
      prisma.disfrazFisico.updateMany
    ).not.toHaveBeenCalled();
  });

  it("PF-DIS-CAT-11: elimina la suspensión de disfraces cuyo lavado ya terminó", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-10-29T12:00:00.000Z")
    );

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        id: "disfraz-vencido",
        fechaSuspension: new Date(
          "2026-10-26T08:00:00.000Z"
        ),
      },
      {
        id: "disfraz-vigente",
        fechaSuspension: new Date(
          "2026-10-28T08:00:00.000Z"
        ),
      },
    ] as any);

    vi.mocked(prisma.disfrazFisico.updateMany).mockResolvedValue({
      count: 1,
    } as any);

    await limpiarSuspensionesVencidas();

    expect(prisma.disfrazFisico.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["disfraz-vencido"],
        },
      },
      data: {
        estadoManual: null,
        fechaSuspension: null,
      },
    });

    vi.useRealTimers();
  });

  // ==========================================================
  // LISTADO Y ESTADOS
  // ==========================================================

  it("PF-DIS-CAT-12: lista disfraces disponibles y calcula que están completos", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase(),
    ] as any);

    configurarEstados();

    const resultado = await listarDisfraces({});

    expect(resultado).toHaveLength(1);
    expect(resultado[0].estado).toBe("DISPONIBLE");
    expect(resultado[0].faltantes).toBe(0);
    expect(resultado[0].completo).toBe(true);
    expect(resultado[0].prestamosSalientes).toBe(0);
  });

  it("PF-DIS-CAT-13: aplica filtros de nombre, temporada y tipo", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce(
      [] as any
    );

    configurarEstados();

    await listarDisfraces({
      nombre: "bat",
      temporadas: ["HALLOWEEN"],
      tipos: ["SUPERHEROE"],
    });

    expect(prisma.disfrazFisico.findMany).toHaveBeenLastCalledWith({
      where: {
        origen: "CATALOGO",
        nombre: {
          contains: "bat",
          mode: "insensitive",
        },
        temporadaEvento: {
          in: ["HALLOWEEN"],
          mode: "insensitive",
        },
        tipoDisfraz: {
          in: ["SUPERHEROE"],
          mode: "insensitive",
        },
      },
      include: {
        prendasHogar: true,
        prendasActuales: true,
      },
      orderBy: {
        creadoEn: "desc",
      },
    });
  });

  it("PF-DIS-CAT-14: marca INCOMPLETO cuando falta una pieza requerida", async () => {
    configurarLimpiezaVacia();

    const incompleto = disfrazBase({
      prendasActuales: [
        {
          id: "prenda-1",
          tipo: "CAPA",
          estado: "DISPONIBLE",
        },
      ],
    });

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      incompleto,
    ] as any);

    configurarEstados();

    const resultado = await listarDisfraces({});

    expect(resultado[0].estado).toBe("INCOMPLETO");
    expect(resultado[0].faltantes).toBe(1);
    expect(resultado[0].completo).toBe(false);
  });

  it("PF-DIS-CAT-15: ignora piezas dañadas al calcular la completitud", async () => {
    configurarLimpiezaVacia();

    const d = disfrazBase({
      prendasActuales: [
        {
          id: "prenda-1",
          tipo: "CAPA",
          estado: "DISPONIBLE",
        },
        {
          id: "prenda-2",
          tipo: "MASCARA",
          estado: "DANADA",
        },
      ],
    });

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      d,
    ] as any);

    configurarEstados();

    const resultado = await listarDisfraces({});

    expect(resultado[0].estado).toBe("INCOMPLETO");
    expect(resultado[0].faltantes).toBe(1);
  });

  it("PF-DIS-CAT-16: marca ALQUILADO antes de evaluar piezas faltantes", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase({
        prendasActuales: [],
      }),
    ] as any);

    configurarEstados(["disfraz-1"]);

    const resultado = await listarDisfraces({});

    expect(resultado[0].estado).toBe("ALQUILADO");
  });

  it("PF-DIS-CAT-17: marca RESERVADO cuando existe una reserva vigente", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase(),
    ] as any);

    configurarEstados([], ["disfraz-1"]);

    const resultado = await listarDisfraces({});

    expect(resultado[0].estado).toBe("RESERVADO");
  });

  it("PF-DIS-CAT-18: EN_REPARACION tiene prioridad sobre alquileres y reservas", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase({
        estadoManual: "EN_REPARACION",
      }),
    ] as any);

    configurarEstados(
      ["disfraz-1"],
      ["disfraz-1"]
    );

    const resultado = await listarDisfraces({});

    expect(resultado[0].estado).toBe("EN_REPARACION");
    expect(resultado[0].faseLavado).toBeNull();
  });

  it("PF-DIS-CAT-19: muestra SUSPENDIDO y su fase mientras el ciclo de lavado continúa", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-10-27T12:00:00.000Z")
    );

    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase({
        estadoManual: "SUSPENDIDO",
        fechaSuspension: new Date(
          "2026-10-26T08:00:00.000Z"
        ),
      }),
    ] as any);

    configurarEstados();

    const resultado = await listarDisfraces({});

    expect(resultado[0].estado).toBe("SUSPENDIDO");
    expect(resultado[0].faseLavado).toBe("PLANCHADO");

    vi.useRealTimers();
  });

  it("PF-DIS-CAT-20: contabiliza prendas propias prestadas a otros disfraces", async () => {
    configurarLimpiezaVacia();

    const d = disfrazBase();

    d.prendasHogar[0].disfrazActualId = "otro-disfraz";

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      d,
    ] as any);

    configurarEstados();

    const resultado = await listarDisfraces({});

    expect(resultado[0].prestamosSalientes).toBe(1);
  });

  // ==========================================================
  // CONSULTA INDIVIDUAL
  // ==========================================================

  it("PF-DIS-CAT-21: devuelve null cuando el disfraz solicitado no existe", async () => {
    configurarLimpiezaVacia();

    vi.mocked(
      prisma.disfrazFisico.findUnique
    ).mockResolvedValue(null);

    const resultado = await obtenerDisfrazConEstado(
      "inexistente"
    );

    expect(resultado).toBeNull();
  });

  it("PF-DIS-CAT-22: obtiene un disfraz con estado, faltantes y completitud calculados", async () => {
    configurarLimpiezaVacia();

    vi.mocked(
      prisma.disfrazFisico.findUnique
    ).mockResolvedValue(disfrazBase() as any);

    configurarEstados();

    const resultado = await obtenerDisfrazConEstado(
      "disfraz-1"
    );

    expect(resultado).toMatchObject({
      id: "disfraz-1",
      estado: "DISPONIBLE",
      faltantes: 0,
      completo: true,
      prestamosSalientes: 0,
    });
  });

  // ==========================================================
  // DISPONIBILIDAD
  // ==========================================================

  it("PF-DIS-CAT-23: devuelve únicamente los disfraces que no pueden alquilarse", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase({
        id: "disponible",
        nombre: "Disponible",
      }),

      disfrazBase({
        id: "ocupado",
        nombre: "Ocupado",
      }),
    ] as any);

    configurarEstados(["ocupado"]);

    const resultado = await disfracesNoDisponibles(
      ["disponible", "ocupado"],
      "usuario-1"
    );

    expect(resultado).toEqual([
      {
        id: "ocupado",
        nombre: "Ocupado",
        estado: "ALQUILADO",
      },
    ]);

    expect(obtenerReservadosIds).toHaveBeenCalledWith(
      "usuario-1"
    );
  });

  it("PF-DIS-CAT-24: considera no disponible un disfraz reservado por otra persona", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase(),
    ] as any);

    configurarEstados([], ["disfraz-1"]);

    const resultado = await disfracesNoDisponibles(
      ["disfraz-1"],
      "usuario-1"
    );

    expect(resultado[0].estado).toBe("RESERVADO");
  });

  // ==========================================================
  // ESTADOS RESUMIDOS
  // ==========================================================

  it("PF-DIS-CAT-25: obtiene estados resumidos para ids específicos", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce([
      disfrazBase(),
    ] as any);

    configurarEstados();

    const resultado = await estadosDeDisfraces([
      "disfraz-1",
    ]);

    expect(resultado).toEqual([
      {
        id: "disfraz-1",
        nombre: "Batman",
        familia: "Batman",
        estado: "DISPONIBLE",
      },
    ]);
  });

  it("PF-DIS-CAT-26: permite consultar los estados de todo el catálogo", async () => {
    configurarLimpiezaVacia();

    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValueOnce(
      [] as any
    );

    configurarEstados();

    await estadosDeDisfraces();

    expect(prisma.disfrazFisico.findMany).toHaveBeenLastCalledWith({
      where: {
        origen: "CATALOGO",
      },
      include: {
        prendasHogar: true,
        prendasActuales: true,
      },
    });
  });

  // ==========================================================
  // FILTROS DISPONIBLES
  // ==========================================================

  it("PF-DIS-CAT-27: devuelve las temporadas disponibles del catálogo", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        temporadaEvento: "HALLOWEEN",
      },
      {
        temporadaEvento: "NAVIDAD",
      },
    ] as any);

    const resultado =
      await obtenerTemporadasDisponibles();

    expect(resultado).toEqual([
      "HALLOWEEN",
      "NAVIDAD",
    ]);
  });

  it("PF-DIS-CAT-28: devuelve los tipos disponibles del catálogo", async () => {
    vi.mocked(prisma.disfrazFisico.findMany).mockResolvedValue([
      {
        tipoDisfraz: "SUPERHEROE",
      },
      {
        tipoDisfraz: "TERROR",
      },
    ] as any);

    const resultado = await obtenerTiposDisponibles();

    expect(resultado).toEqual([
      "SUPERHEROE",
      "TERROR",
    ]);
  });
});