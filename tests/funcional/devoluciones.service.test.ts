import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    alquiler: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },

    prenda: {
      findMany: vi.fn(),
      update: vi.fn(),
    },

    devolucion: {
      create: vi.fn(),
      findMany: vi.fn(),
    },

    disfrazFisico: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },

    movimientoPrenda: {
      count: vi.fn(),
    },

    sustitucion: {
      create: vi.fn(),
    },

    $transaction: vi.fn(),
  },
}));

vi.mock(
  "../../src/modules/disfraces/disfraces.service",
  () => ({
    buscarCandidatos: vi.fn(),
  })
);

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../src/config/prisma";

import {
  buscarCandidatos,
} from "../../src/modules/disfraces/disfraces.service";

import {
  ErrorDevolucion,
  crearDevolucion,
  listarDevoluciones,
} from "../../src/modules/devoluciones/devoluciones.service";

// ============================================================
// HELPERS
// ============================================================

function datosDevolucion(
  overrides: Record<string, any> = {}
) {
  return {
    alquilerId: "alquiler-1",
    fechaDevolucion: "2026-10-27",
    observaciones: "Todo correcto",

    prendas: [
      {
        prendaId: "prenda-1",
        estadoPrenda: "BUEN_ESTADO",
      },
    ],

    ...overrides,
  };
}

function alquiler(
  overrides: Record<string, any> = {}
) {
  return {
    id: "alquiler-1",
    usuarioId: "usuario-1",
    estado: "ACTIVO",

    disfraces: [
      {
        disfrazFisicoId: "disfraz-1",
      },
    ],

    ...overrides,
  };
}

function prendaActual(
  overrides: Record<string, any> = {}
) {
  return {
    id: "prenda-1",
    nombre: "Camisa roja",
    disfrazActualId: "disfraz-1",
    disfrazHogarId: "disfraz-1",
    ...overrides,
  };
}

function candidato(
  overrides: Record<string, any> = {}
) {
  return {
    id: "repuesto-1",
    nombre: "Camisa de repuesto",
    disfrazOrigenId: "donante-1",
    disfrazOrigenAlquilado: false,
    esAlmacen: false,
    mismaTalla: false,
    ...overrides,
  };
}

function configurarTransaccionExitosa() {
  vi.mocked(
    prisma.devolucion.create
  ).mockResolvedValue({
    id: "devolucion-1",
  } as any);

  vi.mocked(
    prisma.disfrazFisico.updateMany
  ).mockResolvedValue({
    count: 1,
  } as any);

  vi.mocked(
    prisma.alquiler.update
  ).mockResolvedValue({} as any);

  vi.mocked(
    prisma.$transaction
  ).mockResolvedValue([
    {
      id: "devolucion-1",
    },
    {
      count: 1,
    },
    {},
  ] as any);
}

// ============================================================
// TESTS
// ============================================================

describe(
  "DevolucionesService - devolución de alquileres",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        prisma.alquiler.findFirst
      ).mockResolvedValue(
        alquiler() as any
      );

      vi.mocked(
        prisma.prenda.findMany
      ).mockResolvedValue([
        {
          id: "prenda-1",
        },
      ] as any);

      vi.mocked(
        prisma.prenda.update
      ).mockResolvedValue(
        prendaActual() as any
      );

      vi.mocked(
        prisma.movimientoPrenda.count
      ).mockResolvedValue(0);

      vi.mocked(
        prisma.disfrazFisico.findUnique
      ).mockResolvedValue({
        id: "disfraz-1",
        nombre: "Bombero",
      } as any);

      vi.mocked(
        prisma.sustitucion.create
      ).mockResolvedValue({} as any);

      vi.mocked(
        buscarCandidatos
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.devolucion.findMany
      ).mockResolvedValue([] as any);

      configurarTransaccionExitosa();
    });

    // ========================================================
    // VALIDACIONES INICIALES
    // ========================================================

    it(
      "PF-DEV-01: rechaza una fecha de devolución inválida",
      async () => {
        const promesa = crearDevolucion(
          datosDevolucion({
            fechaDevolucion:
              "fecha-invalida",
          }) as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 400,
          message:
            "La fecha de devolución no es válida.",
        });

        expect(
          prisma.alquiler.findFirst
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DEV-02: busca el alquiler únicamente para el usuario propietario",
      async () => {
        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        expect(
          prisma.alquiler.findFirst
        ).toHaveBeenCalledWith({
          where: {
            id: "alquiler-1",
            usuarioId: "usuario-1",
          },

          include: {
            disfraces: true,
          },
        });
      }
    );

    it(
      "PF-DEV-03: devuelve 404 cuando el alquiler no existe para el usuario",
      async () => {
        vi.mocked(
          prisma.alquiler.findFirst
        ).mockResolvedValue(null);

        const promesa = crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 404,
          message: "Alquiler no encontrado",
        });

        expect(
          prisma.prenda.findMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DEV-04: rechaza un alquiler ya finalizado",
      async () => {
        vi.mocked(
          prisma.alquiler.findFirst
        ).mockResolvedValue(
          alquiler({
            estado: "FINALIZADO",
          }) as any
        );

        const promesa = crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 409,
          message:
            "Este alquiler ya fue devuelto.",
        });

        expect(
          prisma.$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DEV-05: rechaza un alquiler cancelado",
      async () => {
        vi.mocked(
          prisma.alquiler.findFirst
        ).mockResolvedValue(
          alquiler({
            estado: "CANCELADO",
          }) as any
        );

        const promesa = crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 409,
          message:
            "Este alquiler ya fue devuelto.",
        });
      }
    );

    it(
      "PF-DEV-06: elimina disfraces duplicados del alquiler antes de consultar sus prendas",
      async () => {
        vi.mocked(
          prisma.alquiler.findFirst
        ).mockResolvedValue(
          alquiler({
            disfraces: [
              {
                disfrazFisicoId:
                  "disfraz-1",
              },
              {
                disfrazFisicoId:
                  "disfraz-1",
              },
              {
                disfrazFisicoId:
                  "disfraz-2",
              },
            ],
          }) as any
        );

        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        expect(
          prisma.prenda.findMany
        ).toHaveBeenCalledWith({
          where: {
            disfrazActualId: {
              in: [
                "disfraz-1",
                "disfraz-2",
              ],
            },
          },

          select: {
            id: true,
          },
        });
      }
    );

    // ========================================================
    // INTEGRIDAD DEL REPORTE
    // ========================================================

    it(
      "PF-DEV-07: rechaza prendas repetidas en el reporte",
      async () => {
        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          {
            id: "prenda-1",
          },
        ] as any);

        const promesa = crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda:
                  "BUEN_ESTADO",
              },
              {
                prendaId: "prenda-1",
                estadoPrenda:
                  "DANADA",
              },
            ],
          }) as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 400,
          message:
            "Hay prendas repetidas en el reporte.",
        });

        expect(
          prisma.$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DEV-08: rechaza una prenda que no pertenece al alquiler",
      async () => {
        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          {
            id: "prenda-1",
          },
        ] as any);

        const promesa = crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId:
                  "prenda-ajena",
                estadoPrenda:
                  "BUEN_ESTADO",
              },
            ],
          }) as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 400,
          message:
            "El reporte incluye prendas que no pertenecen a este alquiler.",
        });
      }
    );

    it(
      "PF-DEV-09: exige reportar todas las prendas del alquiler",
      async () => {
        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          {
            id: "prenda-1",
          },
          {
            id: "prenda-2",
          },
        ] as any);

        const promesa = crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda:
                  "BUEN_ESTADO",
              },
            ],
          }) as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 400,
          message:
            "Debes reportar el estado de todas las prendas del alquiler.",
        });
      }
    );

    it(
      "PF-DEV-10: permite el reporte cuando cubre exactamente todas las prendas del alquiler",
      async () => {
        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          {
            id: "prenda-1",
          },
          {
            id: "prenda-2",
          },
        ] as any);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "BUEN_ESTADO",
                },
                {
                  prendaId:
                    "prenda-2",
                  estadoPrenda:
                    "BUEN_ESTADO",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          resultado.devolucion
        ).toEqual({
          id: "devolucion-1",
        });
      }
    );

    // ========================================================
    // REGISTRO TRANSACCIONAL
    // ========================================================

    it(
      "PF-DEV-11: registra la devolución como APROBADA con las prendas reportadas",
      async () => {
        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        const llamada = vi.mocked(
          prisma.devolucion.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data
        ).toMatchObject({
          alquilerId: "alquiler-1",
          observaciones:
            "Todo correcto",
          estado: "APROBADA",

          prendas: {
            create: [
              {
                prendaId: "prenda-1",
                estadoPrenda:
                  "BUEN_ESTADO",
              },
            ],
          },
        });

        expect(
          llamada.data.fechaDevolucion
        ).toBeInstanceOf(Date);
      }
    );

    it(
      "PF-DEV-12: pone todos los disfraces devueltos en estado de lavado",
      async () => {
        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        const llamada = vi.mocked(
          prisma.disfrazFisico.updateMany
        ).mock.calls[0][0] as any;

        expect(
          llamada.where
        ).toEqual({
          id: {
            in: ["disfraz-1"],
          },
        });

        expect(
          llamada.data.estadoManual
        ).toBe("SUSPENDIDO");

        expect(
          llamada.data.fechaSuspension
        ).toBeInstanceOf(Date);
      }
    );

    it(
      "PF-DEV-13: finaliza el alquiler al registrar la devolución",
      async () => {
        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        expect(
          prisma.alquiler.update
        ).toHaveBeenCalledWith({
          where: {
            id: "alquiler-1",
          },

          data: {
            estado: "FINALIZADO",
          },
        });
      }
    );

    it(
      "PF-DEV-14: devolución, lavado y cierre del alquiler se ejecutan en una sola transacción",
      async () => {
        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        expect(
          prisma.$transaction
        ).toHaveBeenCalledTimes(1);

        const operaciones = vi.mocked(
          prisma.$transaction
        ).mock.calls[0][0] as unknown as any[];

        expect(operaciones).toHaveLength(3);
      }
    );

    it(
      "PF-DEV-15: traduce P2002 como devolución duplicada",
      async () => {
        const error =
          new Prisma.PrismaClientKnownRequestError(
            "Unique constraint",
            {
              code: "P2002",
              clientVersion: "5.22.0",
            }
          );

        vi.mocked(
          prisma.$transaction
        ).mockRejectedValue(error);

        const promesa = crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        await expect(promesa).rejects.toMatchObject({
          estado: 409,
          message:
            "Este alquiler ya fue devuelto.",
        });
      }
    );

    it(
      "PF-DEV-16: propaga errores transaccionales distintos de P2002",
      async () => {
        vi.mocked(
          prisma.$transaction
        ).mockRejectedValue(
          new Error(
            "Fallo inesperado de base de datos"
          )
        );

        await expect(
          crearDevolucion(
            datosDevolucion() as any,
            "usuario-1"
          )
        ).rejects.toThrow(
          "Fallo inesperado de base de datos"
        );
      }
    );

    // ========================================================
    // ESTADO DE LAS PRENDAS
    // ========================================================

    it(
      "PF-DEV-17: no modifica una prenda reportada en buen estado",
      async () => {
        await crearDevolucion(
          datosDevolucion() as any,
          "usuario-1"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();

        expect(
          buscarCandidatos
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DEV-18: registra una prenda dañada antes de buscar sustitución",
      async () => {
        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValueOnce(
          prendaActual() as any
        );

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "DANADA",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.prenda.update
        ).toHaveBeenNthCalledWith(
          1,
          {
            where: {
              id: "prenda-1",
            },

            data: {
              estado: "DANADA",
            },
          }
        );
      }
    );

    it(
      "PF-DEV-19: registra una prenda faltante antes de buscar sustitución",
      async () => {
        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValueOnce(
          prendaActual() as any
        );

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "FALTANTE",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.prenda.update
        ).toHaveBeenNthCalledWith(
          1,
          {
            where: {
              id: "prenda-1",
            },

            data: {
              estado: "FALTANTE",
            },
          }
        );
      }
    );

    // ========================================================
    // AJUSTE DE TALLA
    // ========================================================

    it(
      "PF-DEV-20: no busca sustitución para una pieza proveniente de un ajuste de talla activo",
      async () => {
        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValueOnce(
          prendaActual() as any
        );

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(1);

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "DANADA",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.movimientoPrenda.count
        ).toHaveBeenCalledWith({
          where: {
            prendaId: "prenda-1",
            haciaId: "disfraz-1",

            reserva: {
              tipo: "AJUSTE_TALLA",
              liberadaEn: null,
            },
          },
        });

        expect(
          buscarCandidatos
        ).not.toHaveBeenCalled();
      }
    );

    // ========================================================
    // BÚSQUEDA DE DONANTE
    // ========================================================

    it(
      "PF-DEV-21: ignora candidatos cuyo disfraz de origen está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValueOnce(
          prendaActual() as any
        );

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            id: "ocupado",
            disfrazOrigenAlquilado:
              true,
          }),

          candidato({
            id: "libre",
            disfrazOrigenAlquilado:
              false,
          }),
        ] as any);

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "DANADA",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.prenda.update
        ).toHaveBeenNthCalledWith(
          2,
          {
            where: {
              id: "libre",
            },

            data: {
              disfrazActualId:
                "disfraz-1",
            },
          }
        );
      }
    );

    it(
      "PF-DEV-22: rechaza un repuesto del almacén cuando no tiene la misma talla",
      async () => {
        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValueOnce(
          prendaActual() as any
        );

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            id: "almacen-mal",
            esAlmacen: true,
            mismaTalla: false,
          }),
        ] as any);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "DANADA",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          resultado.sustituciones
        ).toEqual([]);

        expect(
          prisma.sustitucion.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DEV-23: acepta un repuesto del almacén cuando tiene la misma talla",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual() as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            id: "almacen-bien",
            nombre:
              "Camisa almacén",
            esAlmacen: true,
            mismaTalla: true,
          }),
        ] as any);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "DANADA",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          resultado.sustituciones
        ).toHaveLength(1);

        expect(
          resultado.sustituciones[0]
            .prenda
        ).toBe("Camisa almacén");
      }
    );

    it(
      "PF-DEV-24: acepta un donante de otro disfraz aunque mismaTalla sea false",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual() as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            id: "donante-otro",
            esAlmacen: false,
            mismaTalla: false,
          }),
        ] as any);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "DANADA",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          resultado.sustituciones
        ).toHaveLength(1);
      }
    );

    it(
      "PF-DEV-25: no crea sustitución cuando no existe un donante compatible",
      async () => {
        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValueOnce(
          prendaActual() as any
        );

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([] as any);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "DANADA",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          prisma.sustitucion.create
        ).not.toHaveBeenCalled();

        expect(
          resultado.sustituciones
        ).toEqual([]);
      }
    );

    // ========================================================
    // APLICACIÓN DE SUSTITUCIÓN
    // ========================================================

    it(
      "PF-DEV-26: mueve el repuesto compatible al disfraz que necesita la pieza",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual() as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            id: "repuesto-1",
          }),
        ] as any);

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "DANADA",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.prenda.update
        ).toHaveBeenNthCalledWith(
          2,
          {
            where: {
              id: "repuesto-1",
            },

            data: {
              disfrazActualId:
                "disfraz-1",
            },
          }
        );
      }
    );

    it(
      "PF-DEV-27: registra la sustitución de una pieza dañada",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual({
              nombre: "Camisa roja",
            }) as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            id: "repuesto-1",
            disfrazOrigenId:
              "donante-1",
          }),
        ] as any);

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "DANADA",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.sustitucion.create
        ).toHaveBeenCalledWith({
          data: {
            prendaId: "repuesto-1",
            disfrazOrigenId:
              "donante-1",
            disfrazDestinoId:
              "disfraz-1",

            motivo:
              "Camisa roja reportada como dañada en Bombero",
          },
        });
      }
    );

    it(
      "PF-DEV-28: registra la sustitución de una pieza faltante con el motivo correcto",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual({
              nombre: "Sombrero",
            }) as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato(),
        ] as any);

        await crearDevolucion(
          datosDevolucion({
            prendas: [
              {
                prendaId: "prenda-1",
                estadoPrenda: "FALTANTE",
              },
            ],
          }) as any,
          "usuario-1"
        );

        expect(
          prisma.sustitucion.create
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            motivo:
              "Sombrero reportada como faltante en Bombero",
          }),
        });
      }
    );

    it(
      "PF-DEV-29: devuelve la sustitución aplicada al cliente",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual() as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato({
            nombre:
              "Camisa sustituta",
          }),
        ] as any);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "DANADA",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          resultado.sustituciones
        ).toEqual([
          {
            prenda:
              "Camisa sustituta",
            disfrazNecesitado:
              "Bombero",
          },
        ]);
      }
    );

    it(
      "PF-DEV-30: usa cadena vacía si no encuentra el nombre del disfraz destino",
      async () => {
        vi.mocked(
          prisma.prenda.update
        )
          .mockResolvedValueOnce(
            prendaActual() as any
          )
          .mockResolvedValueOnce({} as any);

        vi.mocked(
          buscarCandidatos
        ).mockResolvedValue([
          candidato(),
        ] as any);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(null);

        const resultado =
          await crearDevolucion(
            datosDevolucion({
              prendas: [
                {
                  prendaId:
                    "prenda-1",
                  estadoPrenda:
                    "DANADA",
                },
              ],
            }) as any,
            "usuario-1"
          );

        expect(
          resultado.sustituciones[0]
            .disfrazNecesitado
        ).toBe("");

        expect(
          prisma.sustitucion.create
        ).toHaveBeenCalledWith({
          data: expect.objectContaining({
            motivo:
              "Camisa roja reportada como dañada en undefined",
          }),
        });
      }
    );

    // ========================================================
    // LISTADO
    // ========================================================

    it(
      "PF-DEV-31: lista devoluciones con alquiler, cliente, disfraces, prendas y responsable",
      async () => {
        await listarDevoluciones();

        expect(
          prisma.devolucion.findMany
        ).toHaveBeenCalledWith({
          include: {
            alquiler: {
              include: {
                usuario: {
                  select: {
                    nombre: true,
                    email: true,
                  },
                },

                disfraces: {
                  include: {
                    disfrazFisico: true,
                  },
                },
              },
            },

            prendas: {
              include: {
                prenda: true,
              },
            },

            resueltaPor: {
              select: {
                nombre: true,
              },
            },
          },

          orderBy: {
            creadoEn: "desc",
          },
        });
      }
    );

    it(
      "PF-DEV-32: devuelve directamente el resultado obtenido de Prisma al listar devoluciones",
      async () => {
        const filas = [
          {
            id: "dev-1",
          },
          {
            id: "dev-2",
          },
        ];

        vi.mocked(
          prisma.devolucion.findMany
        ).mockResolvedValue(
          filas as any
        );

        const resultado =
          await listarDevoluciones();

        expect(resultado).toEqual(
          filas
        );
      }
    );
  }
);