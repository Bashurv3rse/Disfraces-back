import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },

    prenda: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },

    alquilerDisfraz: {
      findMany: vi.fn(),
    },

    movimientoPrenda: {
      count: vi.fn(),
    },

    sustitucion: {
      create: vi.fn(),
    },
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
  buscarCandidatos,
  confirmarPrestamo,
  devolverPrestamo,
} from "../../../src/modules/disfraces/disfraces.service";

// ============================================================
// HELPERS
// ============================================================

function prendaNecesitada(
  overrides: Record<string, any> = {}
) {
  return {
    id: "necesitada-1",
    nombre: "Capa",
    tipo: "CAPA",
    color: "NEGRO",
    talla: "M",
    calidad: "BUENA",
    estado: "FALTANTE",

    disfrazHogarId: "disfraz-1",
    disfrazActualId: "disfraz-1",

    ...overrides,
  };
}

function disfrazNecesitado(
  overrides: Record<string, any> = {}
) {
  return {
    id: "disfraz-1",
    nombre: "Batman",
    familia: "Batman",
    grupoCompatibilidad: "grupo-batman",
    origen: "CATALOGO",
    estadoManual: null,
    fechaSuspension: null,

    ...overrides,
  };
}

function candidata(
  overrides: Record<string, any> = {}
) {
  return {
    id: "donante-1",
    nombre: "Capa",
    tipo: "CAPA",
    color: "NEGRO",
    talla: "M",
    calidad: "EXCELENTE",
    estado: "DISPONIBLE",

    disfrazHogarId: "disfraz-2",
    disfrazActualId: "disfraz-2",

    disfrazHogar: {
      id: "disfraz-2",
      nombre: "Batman #2",
      familia: "Batman",
      grupoCompatibilidad: "grupo-batman",
      origen: "CATALOGO",
      estadoManual: null,
      fechaSuspension: null,
    },

    ...overrides,
  };
}

function configurarLimpieza() {
  vi.mocked(
    liberarReservasVencidas
  ).mockResolvedValue(undefined as any);

  vi.mocked(
    desarmarReservasTerminadas
  ).mockResolvedValue(undefined as any);

  vi.mocked(
    prisma.disfrazFisico.findMany
  ).mockResolvedValue([] as any);

  vi.mocked(
    prisma.disfrazFisico.updateMany
  ).mockResolvedValue({
    count: 0,
  } as any);
}

function configurarAlquilados(
  ids: string[] = []
) {
  vi.mocked(
    prisma.alquilerDisfraz.findMany
  ).mockResolvedValue(
    ids.map((id) => ({
      disfrazFisicoId: id,
    })) as any
  );
}

function configurarBusquedaBase() {
  vi.mocked(
    prisma.prenda.findUnique
  ).mockResolvedValue(
    prendaNecesitada() as any
  );

  vi.mocked(
    prisma.disfrazFisico.findUnique
  ).mockResolvedValue(
    disfrazNecesitado() as any
  );

  vi.mocked(
    obtenerReservadosIds
  ).mockResolvedValue(
    new Set() as any
  );

  configurarAlquilados();
}

// ============================================================
// TESTS
// ============================================================

describe(
  "DisfracesService - candidatos y préstamos",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      configurarLimpieza();

      vi.mocked(
        obtenerReservadosIds
      ).mockResolvedValue(
        new Set() as any
      );

      configurarAlquilados();

      vi.mocked(
        prisma.movimientoPrenda.count
      ).mockResolvedValue(0);

      vi.mocked(
        prisma.prenda.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.prenda.update
      ).mockResolvedValue({} as any);

      vi.mocked(
        prisma.sustitucion.create
      ).mockResolvedValue({} as any);
    });

    // ========================================================
    // BUSCAR CANDIDATOS
    // ========================================================

    it(
      "PF-DIS-PRE-01: rechaza la búsqueda cuando la prenda no existe",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(null);

        await expect(
          buscarCandidatos("inexistente")
        ).rejects.toThrow(
          "Prenda no encontrada"
        );

        expect(
          prisma.prenda.findMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-02: rechaza la búsqueda cuando el disfraz necesitado no existe",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaNecesitada() as any
        );

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(null);

        await expect(
          buscarCandidatos("necesitada-1")
        ).rejects.toThrow(
          "Disfraz no encontrado"
        );
      }
    );

    it(
      "PF-DIS-PRE-03: usa por defecto el disfraz de origen de la prenda como disfraz necesitado",
      async () => {
        configurarBusquedaBase();

        await buscarCandidatos(
          "necesitada-1"
        );

        expect(
          prisma.disfrazFisico.findUnique
        ).toHaveBeenCalledWith({
          where: {
            id: "disfraz-1",
          },
        });
      }
    );

    it(
      "PF-DIS-PRE-04: permite indicar explícitamente otro disfraz necesitado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaNecesitada() as any
        );

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazNecesitado({
            id: "disfraz-destino",
          }) as any
        );

        await buscarCandidatos(
          "necesitada-1",
          "disfraz-destino"
        );

        expect(
          prisma.disfrazFisico.findUnique
        ).toHaveBeenCalledWith({
          where: {
            id: "disfraz-destino",
          },
        });
      }
    );

    it(
      "PF-DIS-PRE-05: un disfraz que no pertenece al catálogo no recibe reemplazos",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaNecesitada() as any
        );

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazNecesitado({
            origen: "A_MEDIDA",
          }) as any
        );

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado).toEqual([]);

        expect(
          prisma.prenda.findMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-06: busca repuestos de almacén por nombre y piezas del mismo grupo de compatibilidad",
      async () => {
        configurarBusquedaBase();

        await buscarCandidatos(
          "necesitada-1"
        );

        expect(
          prisma.prenda.findMany
        ).toHaveBeenCalledWith({
          where: {
            tipo: "CAPA",
            estado: "DISPONIBLE",

            id: {
              not: "necesitada-1",
            },

            disfrazHogarId: {
              not: "disfraz-1",
            },

            OR: [
              {
                nombre: {
                  equals: "Capa",
                  mode: "insensitive",
                },

                disfrazHogar: {
                  origen: "ALMACEN",
                },
              },

              {
                disfrazHogar: {
                  origen: "CATALOGO",
                  grupoCompatibilidad:
                    "grupo-batman",
                },
              },
            ],
          },

          include: {
            disfrazHogar: true,
          },
        });
      }
    );

    it(
      "PF-DIS-PRE-07: cuando no existe grupo de compatibilidad solo busca repuestos del almacén",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaNecesitada() as any
        );

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazNecesitado({
            grupoCompatibilidad: null,
          }) as any
        );

        await buscarCandidatos(
          "necesitada-1"
        );

        const llamada = vi.mocked(
          prisma.prenda.findMany
        ).mock.calls[0][0] as any;

        expect(llamada.where.OR).toHaveLength(
          1
        );

        expect(
          llamada.where.OR[0]
        ).toEqual({
          nombre: {
            equals: "Capa",
            mode: "insensitive",
          },

          disfrazHogar: {
            origen: "ALMACEN",
          },
        });
      }
    );

    it(
      "PF-DIS-PRE-08: descarta candidatas que ya están prestadas a otro disfraz",
      async () => {
        configurarBusquedaBase();

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata({
            disfrazActualId:
              "otro-disfraz",
          }),
        ] as any);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado).toEqual([]);
      }
    );

    it(
      "PF-DIS-PRE-09: descarta candidatas cuyo disfraz de origen continúa en lavado",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-10-27T12:00:00.000Z"
          )
        );

        configurarBusquedaBase();

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata({
            disfrazHogar: {
              id: "disfraz-2",
              nombre: "Batman #2",
              familia: "Batman",
              grupoCompatibilidad:
                "grupo-batman",
              origen: "CATALOGO",

              estadoManual:
                "SUSPENDIDO",

              fechaSuspension:
                new Date(
                  "2026-10-26T08:00:00.000Z"
                ),
            },
          }),
        ] as any);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado).toEqual([]);

        vi.useRealTimers();
      }
    );

    it(
      "PF-DIS-PRE-10: descarta candidatas cuyo disfraz de origen tiene una reserva vigente",
      async () => {
        configurarBusquedaBase();

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata(),
        ] as any);

        vi.mocked(
          obtenerReservadosIds
        ).mockResolvedValue(
          new Set(["disfraz-2"]) as any
        );

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado).toEqual([]);
      }
    );

    it(
      "PF-DIS-PRE-11: devuelve la información calculada de una candidata válida",
      async () => {
        configurarBusquedaBase();

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata(),
        ] as any);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado).toHaveLength(1);

        expect(resultado[0]).toEqual({
          id: "donante-1",
          nombre: "Capa",
          calidad: "EXCELENTE",
          color: "NEGRO",
          talla: "M",

          disfrazOrigenId:
            "disfraz-2",

          disfrazOrigenNombre:
            "Batman #2",

          disfrazOrigenAlquilado:
            false,

          esAlmacen: false,
          mismaFamilia: true,
          mismaTalla: true,
          mismoColor: true,
        });
      }
    );

    it(
      "PF-DIS-PRE-12: identifica correctamente una candidata proveniente del almacén",
      async () => {
        configurarBusquedaBase();

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata({
            disfrazHogarId:
              "almacen-1",

            disfrazActualId:
              "almacen-1",

            disfrazHogar: {
              id: "almacen-1",
              nombre: "Almacén",
              familia: null,
              grupoCompatibilidad: null,
              origen: "ALMACEN",
              estadoManual: null,
              fechaSuspension: null,
            },
          }),
        ] as any);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado[0]).toMatchObject({
          esAlmacen: true,
          mismaFamilia: false,
        });
      }
    );

    it(
      "PF-DIS-PRE-13: marca cuando el disfraz donante está alquilado",
      async () => {
        configurarBusquedaBase();

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata(),
        ] as any);

        configurarAlquilados([
          "disfraz-2",
        ]);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(
          resultado[0]
            .disfrazOrigenAlquilado
        ).toBe(true);
      }
    );

    it(
      "PF-DIS-PRE-14: ordena primero candidatos cuyo disfraz no está alquilado",
      async () => {
        configurarBusquedaBase();

        const alquilada = candidata({
          id: "alquilada",

          disfrazHogarId:
            "disfraz-alquilado",

          disfrazActualId:
            "disfraz-alquilado",

          disfrazHogar: {
            id: "disfraz-alquilado",
            nombre: "Donante alquilado",
            familia: "Batman",
            grupoCompatibilidad:
              "grupo-batman",
            origen: "CATALOGO",
            estadoManual: null,
            fechaSuspension: null,
          },
        });

        const libre = candidata({
          id: "libre",

          disfrazHogarId:
            "disfraz-libre",

          disfrazActualId:
            "disfraz-libre",

          disfrazHogar: {
            id: "disfraz-libre",
            nombre: "Donante libre",
            familia: "Batman",
            grupoCompatibilidad:
              "grupo-batman",
            origen: "CATALOGO",
            estadoManual: null,
            fechaSuspension: null,
          },
        });

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          alquilada,
          libre,
        ] as any);

        configurarAlquilados([
          "disfraz-alquilado",
        ]);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado.map((x) => x.id))
          .toEqual([
            "libre",
            "alquilada",
          ]);
      }
    );

    it(
      "PF-DIS-PRE-15: prioriza entre candidatos libres el que tenga mejor encaje",
      async () => {
        configurarBusquedaBase();

        const peor = candidata({
          id: "peor",
          color: "ROJO",
          talla: "XL",

          disfrazHogarId:
            "disfraz-3",

          disfrazActualId:
            "disfraz-3",

          disfrazHogar: {
            id: "disfraz-3",
            nombre: "Otro",
            familia: "Otra familia",
            grupoCompatibilidad:
              "grupo-batman",
            origen: "CATALOGO",
            estadoManual: null,
            fechaSuspension: null,
          },
        });

        const mejor = candidata({
          id: "mejor",
        });

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          peor,
          mejor,
        ] as any);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado.map((x) => x.id))
          .toEqual([
            "mejor",
            "peor",
          ]);
      }
    );

    it(
      "PF-DIS-PRE-16: con el mismo puntaje prioriza el repuesto del almacén",
      async () => {
        configurarBusquedaBase();

        const catalogo = candidata({
          id: "catalogo",
          color: "ROJO",
          talla: "XL",

          disfrazHogarId:
            "catalogo-2",

          disfrazActualId:
            "catalogo-2",

          disfrazHogar: {
            id: "catalogo-2",
            nombre: "Otro",
            familia: "Batman",
            grupoCompatibilidad:
              "grupo-batman",
            origen: "CATALOGO",
            estadoManual: null,
            fechaSuspension: null,
          },
        });

        // Almacén:
        // esAlmacen = 4
        // mismaFamilia = false
        // mismaTalla = false
        // mismoColor = false
        // total = 4
        //
        // Catálogo:
        // mismaFamilia = 4
        // resto false
        // total = 4
        const almacen = candidata({
          id: "almacen",
          color: "ROJO",
          talla: "XL",

          disfrazHogarId:
            "almacen-1",

          disfrazActualId:
            "almacen-1",

          disfrazHogar: {
            id: "almacen-1",
            nombre: "Almacén",
            familia: null,
            grupoCompatibilidad: null,
            origen: "ALMACEN",
            estadoManual: null,
            fechaSuspension: null,
          },
        });

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          catalogo,
          almacen,
        ] as any);

        const resultado =
          await buscarCandidatos(
            "necesitada-1"
          );

        expect(resultado.map((x) => x.id))
          .toEqual([
            "almacen",
            "catalogo",
          ]);
      }
    );

    // ========================================================
    // CONFIRMAR PRÉSTAMO
    // ========================================================

    it(
      "PF-DIS-PRE-17: rechaza el préstamo cuando la prenda necesitada no existe",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(null);

        await expect(
          confirmarPrestamo(
            "inexistente",
            "donante-1"
          )
        ).rejects.toThrow(
          "Prenda no encontrada"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-18: rechaza el préstamo cuando el disfraz necesitado está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaNecesitada() as any
        );

        configurarAlquilados([
          "disfraz-1",
        ]);

        await expect(
          confirmarPrestamo(
            "necesitada-1",
            "donante-1"
          )
        ).rejects.toThrow(
          "Este disfraz está alquilado"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-19: rechaza una pieza donante que no aparece entre los candidatos válidos",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        )
          .mockResolvedValueOnce(
            prendaNecesitada() as any
          )
          .mockResolvedValueOnce(
            prendaNecesitada() as any
          );

        configurarAlquilados();

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazNecesitado() as any
        );

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([] as any);

        await expect(
          confirmarPrestamo(
            "necesitada-1",
            "donante-invalida"
          )
        ).rejects.toThrow(
          "La prenda elegida no es un reemplazo válido"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-20: rechaza el préstamo si el disfraz donante está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        )
          .mockResolvedValueOnce(
            prendaNecesitada() as any
          )
          .mockResolvedValueOnce(
            prendaNecesitada() as any
          );

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazNecesitado() as any
        );

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata(),
        ] as any);

        // Primera llamada: estaAlquiladoAhora()
        // Segunda llamada: buscarCandidatos()
        vi.mocked(
          prisma.alquilerDisfraz.findMany
        )
          .mockResolvedValueOnce(
            [] as any
          )
          .mockResolvedValueOnce([
            {
              disfrazFisicoId:
                "disfraz-2",
            },
          ] as any);

        await expect(
          confirmarPrestamo(
            "necesitada-1",
            "donante-1"
          )
        ).rejects.toThrow(
          "El disfraz donante está alquilado"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-21: mueve una pieza donante válida al disfraz necesitado y registra la sustitución",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        )
          .mockResolvedValueOnce(
            prendaNecesitada() as any
          )
          .mockResolvedValueOnce(
            prendaNecesitada() as any
          );

        vi.mocked(
          prisma.disfrazFisico.findUnique
        )
          // buscarCandidatos()
          .mockResolvedValueOnce(
            disfrazNecesitado() as any
          )
          // nombre del destino
          .mockResolvedValueOnce({
            id: "disfraz-1",
            nombre: "Batman",
          } as any);

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          candidata(),
        ] as any);

        configurarAlquilados();

        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValue({
          ...candidata(),
          disfrazActualId:
            "disfraz-1",
        } as any);

        const resultado =
          await confirmarPrestamo(
            "necesitada-1",
            "donante-1"
          );

        expect(
          prisma.prenda.update
        ).toHaveBeenCalledWith({
          where: {
            id: "donante-1",
          },

          data: {
            disfrazActualId:
              "disfraz-1",
          },
        });

        expect(
          prisma.sustitucion.create
        ).toHaveBeenCalledWith({
          data: {
            prendaId: "donante-1",

            disfrazOrigenId:
              "disfraz-2",

            disfrazDestinoId:
              "disfraz-1",

            motivo:
              "Préstamo manual: Capa → Batman",
          },
        });

        expect(resultado).toMatchObject({
          id: "donante-1",
          disfrazActualId:
            "disfraz-1",
        });
      }
    );

    // ========================================================
    // DEVOLVER PRÉSTAMO
    // ========================================================

    it(
      "PF-DIS-PRE-22: rechaza la devolución cuando la prenda no existe",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(null);

        await expect(
          devolverPrestamo("inexistente")
        ).rejects.toThrow(
          "Prenda no encontrada"
        );
      }
    );

    it(
      "PF-DIS-PRE-23: rechaza la devolución cuando la pieza ya está en su disfraz de origen",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata() as any
        );

        await expect(
          devolverPrestamo("donante-1")
        ).rejects.toThrow(
          "Esta prenda no está prestada"
        );
      }
    );

    it(
      "PF-DIS-PRE-24: rechaza devolver una pieza que no está disponible",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata({
            estado: "DANADA",
            disfrazActualId:
              "disfraz-1",
          }) as any
        );

        await expect(
          devolverPrestamo("donante-1")
        ).rejects.toThrow(
          "Solo se puede devolver una prenda en buen estado"
        );
      }
    );

    it(
      "PF-DIS-PRE-25: rechaza devolver manualmente una pieza apartada por una reserva",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata({
            disfrazActualId:
              "disfraz-1",
          }) as any
        );

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(1);

        await expect(
          devolverPrestamo("donante-1")
        ).rejects.toThrow(
          "Esta prenda está apartada por una reserva"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-26: rechaza devolver manualmente una pieza que está dentro de un disfraz a medida",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata({
            disfrazActualId:
              "medida-1",
          }) as any
        );

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        )
          .mockResolvedValueOnce({
            id: "medida-1",
            nombre:
              "Disfraz personalizado",
            origen: "A_MEDIDA",
          } as any)
          .mockResolvedValueOnce({
            id: "disfraz-2",
            nombre: "Batman #2",
            origen: "CATALOGO",
          } as any);

        await expect(
          devolverPrestamo("donante-1")
        ).rejects.toThrow(
          "Esta prenda está en un disfraz a medida"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-27: rechaza la devolución cuando el disfraz que tiene la pieza está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata({
            disfrazActualId:
              "disfraz-1",
          }) as any
        );

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        )
          .mockResolvedValueOnce({
            id: "disfraz-1",
            nombre: "Batman",
            origen: "CATALOGO",
          } as any)
          .mockResolvedValueOnce({
            id: "disfraz-2",
            nombre: "Batman #2",
            origen: "CATALOGO",
          } as any);

        configurarAlquilados([
          "disfraz-1",
        ]);

        await expect(
          devolverPrestamo("donante-1")
        ).rejects.toThrow(
          "Alguno de los dos disfraces está alquilado"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-PRE-28: rechaza la devolución cuando el disfraz de origen está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata({
            disfrazActualId:
              "disfraz-1",
          }) as any
        );

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        )
          .mockResolvedValueOnce({
            id: "disfraz-1",
            nombre: "Batman",
            origen: "CATALOGO",
          } as any)
          .mockResolvedValueOnce({
            id: "disfraz-2",
            nombre: "Batman #2",
            origen: "CATALOGO",
          } as any);

        configurarAlquilados([
          "disfraz-2",
        ]);

        await expect(
          devolverPrestamo("donante-1")
        ).rejects.toThrow(
          "Alguno de los dos disfraces está alquilado"
        );
      }
    );

    it(
      "PF-DIS-PRE-29: devuelve correctamente una pieza a su disfraz de origen y registra el movimiento",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          candidata({
            disfrazActualId:
              "disfraz-1",
          }) as any
        );

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        )
          .mockResolvedValueOnce({
            id: "disfraz-1",
            nombre: "Batman",
            origen: "CATALOGO",
          } as any)
          .mockResolvedValueOnce({
            id: "disfraz-2",
            nombre: "Batman #2",
            origen: "CATALOGO",
          } as any);

        configurarAlquilados();

        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValue({
          ...candidata(),
          disfrazActualId:
            "disfraz-2",
        } as any);

        const resultado =
          await devolverPrestamo(
            "donante-1"
          );

        expect(
          prisma.prenda.update
        ).toHaveBeenCalledWith({
          where: {
            id: "donante-1",
          },

          data: {
            disfrazActualId:
              "disfraz-2",
          },
        });

        expect(
          prisma.sustitucion.create
        ).toHaveBeenCalledWith({
          data: {
            prendaId: "donante-1",

            disfrazOrigenId:
              "disfraz-1",

            disfrazDestinoId:
              "disfraz-2",

            motivo:
              "Préstamo devuelto: Capa vuelve de Batman a Batman #2",
          },
        });

        expect(resultado).toMatchObject({
          id: "donante-1",
          disfrazActualId:
            "disfraz-2",
        });
      }
    );
  }
);