import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findFirst: vi.fn(),
    },

    prenda: {
      findMany: vi.fn(),
    },

    receta: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },

    recetaPieza: {
      deleteMany: vi.fn(),
    },

    peticionDisfraz: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },

    reserva: {
      count: vi.fn(),
    },

    $transaction: vi.fn(),
  },
}));

vi.mock(
  "../../src/modules/a-medida/reservas.base",
  () => ({
    liberarReservasVencidas: vi.fn(),
  })
);

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../src/config/prisma";

import {
  liberarReservasVencidas,
} from "../../src/modules/a-medida/reservas.base";

import {
  ErrorReceta,
  cumpleHueco,
  listarRecetas,
  crearReceta,
  actualizarReceta,
  cambiarActiva,
  eliminarReceta,
} from "../../src/modules/recetas/recetas.service";

// ============================================================
// HELPERS
// ============================================================

function datosReceta(
  overrides: Record<string, any> = {}
) {
  return {
    nombre: "Bombero",
    descripcion: "Disfraz de bombero",
    palabrasClave: [
      "bombero",
      "bomberos",
    ],
    precioDia: 50,
    activa: true,

    piezas: [
      {
        etiqueta: "Camisa roja",
        tipo: "CAMISA",
        colores: ["rojo"],
        nombreContiene: null,
        obligatoria: true,
      },
    ],

    ...overrides,
  };
}

function recetaBD(
  overrides: Record<string, any> = {}
) {
  return {
    id: "receta-1",
    nombre: "Bombero",
    descripcion: "Disfraz de bombero",
    palabrasClave: [
      "bombero",
      "bomberos",
    ],
    precioDia: 50,
    activa: true,

    piezas: [
      {
        id: "hueco-1",
        recetaId: "receta-1",
        etiqueta: "Camisa roja",
        tipo: "CAMISA",
        colores: ["rojo"],
        nombreContiene: null,
        obligatoria: true,
      },
    ],

    ...overrides,
  };
}

function almacenExiste() {
  vi.mocked(
    prisma.disfrazFisico.findFirst
  ).mockResolvedValue({
    id: "almacen-1",
  } as any);
}

function sinAlmacen() {
  vi.mocked(
    prisma.disfrazFisico.findFirst
  ).mockResolvedValue(null);
}

function configurarListado(
  recetas: any[] = [recetaBD()],
  prendas: any[] = []
) {
  vi.mocked(
    prisma.receta.findMany
  ).mockResolvedValue(recetas as any);

  almacenExiste();

  vi.mocked(
    prisma.prenda.findMany
  ).mockResolvedValue(prendas as any);
}

function configurarCreacionExitosa() {
  // 1. validarPalabrasClave()
  // 2. listarRecetas() dentro de obtenerConStock()
  vi.mocked(
    prisma.receta.findMany
  )
    .mockResolvedValueOnce([] as any)
    .mockResolvedValueOnce([
      recetaBD(),
    ] as any);

  vi.mocked(
    prisma.receta.create
  ).mockResolvedValue({
    id: "receta-1",
  } as any);

  almacenExiste();

  vi.mocked(
    prisma.prenda.findMany
  ).mockResolvedValue([
    {
      nombre: "Camisa roja",
      tipo: "CAMISA",
      color: "rojo",
      disfrazActualId: "almacen-1",
    },
  ] as any);

  vi.mocked(
    prisma.peticionDisfraz.findMany
  ).mockResolvedValue([] as any);
}

// ============================================================
// TESTS
// ============================================================

describe(
  "RecetasService - administración de recetas",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        liberarReservasVencidas
      ).mockResolvedValue(undefined as any);

      vi.mocked(
        prisma.disfrazFisico.findFirst
      ).mockResolvedValue({
        id: "almacen-1",
      } as any);

      vi.mocked(
        prisma.prenda.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.receta.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.receta.findUnique
      ).mockResolvedValue({
        id: "receta-1",
      } as any);

      vi.mocked(
        prisma.receta.create
      ).mockResolvedValue({
        id: "receta-1",
      } as any);

      vi.mocked(
        prisma.receta.update
      ).mockResolvedValue({} as any);

      vi.mocked(
        prisma.receta.delete
      ).mockResolvedValue({} as any);

      vi.mocked(
        prisma.recetaPieza.deleteMany
      ).mockResolvedValue({
        count: 1,
      } as any);

      vi.mocked(
        prisma.peticionDisfraz.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.peticionDisfraz.updateMany
      ).mockResolvedValue({
        count: 0,
      } as any);

      vi.mocked(
        prisma.reserva.count
      ).mockResolvedValue(0);

      vi.mocked(
        prisma.$transaction
      ).mockResolvedValue([] as any);
    });

    // ========================================================
    // CUMPLE HUECO
    // ========================================================

    it(
      "PF-REC-01: una pieza cumple un hueco cuando coincide el tipo sin restricciones adicionales",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Camisa elegante",
              tipo: "CAMISA",
              color: "azul",
            },
            {
              tipo: "CAMISA",
              colores: [],
              nombreContiene: null,
            }
          )
        ).toBe(true);
      }
    );

    it(
      "PF-REC-02: una pieza no cumple cuando el tipo es diferente",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Pantalón rojo",
              tipo: "PANTALON",
              color: "rojo",
            },
            {
              tipo: "CAMISA",
              colores: [],
              nombreContiene: null,
            }
          )
        ).toBe(false);
      }
    );

    it(
      "PF-REC-03: valida el color cuando el hueco restringe colores",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Camisa",
              tipo: "CAMISA",
              color: "Rojo",
            },
            {
              tipo: "CAMISA",
              colores: ["rojo", "azul"],
              nombreContiene: null,
            }
          )
        ).toBe(true);
      }
    );

    it(
      "PF-REC-04: normaliza acentos y mayúsculas al comparar colores",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Camisa",
              tipo: "CAMISA",
              color: "MARRÓN",
            },
            {
              tipo: "CAMISA",
              colores: ["marron"],
              nombreContiene: null,
            }
          )
        ).toBe(true);
      }
    );

    it(
      "PF-REC-05: rechaza una pieza cuyo color no está permitido",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Camisa",
              tipo: "CAMISA",
              color: "verde",
            },
            {
              tipo: "CAMISA",
              colores: ["rojo", "azul"],
              nombreContiene: null,
            }
          )
        ).toBe(false);
      }
    );

    it(
      "PF-REC-06: valida el contenido del nombre cuando el hueco lo requiere",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Camisa de Bombero",
              tipo: "CAMISA",
              color: "rojo",
            },
            {
              tipo: "CAMISA",
              colores: [],
              nombreContiene: "bombero",
            }
          )
        ).toBe(true);
      }
    );

    it(
      "PF-REC-07: rechaza una pieza cuyo nombre no contiene el texto solicitado",
      () => {
        expect(
          cumpleHueco(
            {
              nombre: "Camisa de policía",
              tipo: "CAMISA",
              color: "azul",
            },
            {
              tipo: "CAMISA",
              colores: [],
              nombreContiene: "bombero",
            }
          )
        ).toBe(false);
      }
    );

    // ========================================================
    // LISTAR RECETAS Y STOCK
    // ========================================================

    it(
      "PF-REC-08: libera reservas vencidas antes de calcular el stock de recetas",
      async () => {
        await listarRecetas();

        expect(
          liberarReservasVencidas
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "PF-REC-09: busca el disfraz que representa al almacén",
      async () => {
        await listarRecetas();

        expect(
          prisma.disfrazFisico.findFirst
        ).toHaveBeenCalledWith({
          where: {
            origen: "ALMACEN",
          },

          select: {
            id: true,
          },
        });
      }
    );

    it(
      "PF-REC-10: si no existe almacén considera que no hay stock",
      async () => {
        sinAlmacen();

        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          recetaBD(),
        ] as any);

        const [resultado] =
          await listarRecetas();

        expect(
          prisma.prenda.findMany
        ).not.toHaveBeenCalled();

        expect(
          resultado.piezas[0].stock
        ).toBe(0);

        expect(resultado.viable).toBe(
          false
        );
      }
    );

    it(
      "PF-REC-11: consulta solamente prendas disponibles cuyo hogar es el almacén",
      async () => {
        configurarListado();

        await listarRecetas();

        expect(
          prisma.prenda.findMany
        ).toHaveBeenCalledWith({
          where: {
            disfrazHogarId: "almacen-1",
            estado: "DISPONIBLE",
          },

          select: {
            nombre: true,
            tipo: true,
            color: true,
            disfrazActualId: true,
          },
        });
      }
    );

    it(
      "PF-REC-12: no cuenta una pieza que pertenece al almacén pero está prestada a otro disfraz",
      async () => {
        configurarListado(
          [recetaBD()],
          [
            {
              nombre: "Camisa roja",
              tipo: "CAMISA",
              color: "rojo",
              disfrazActualId:
                "otro-disfraz",
            },
          ]
        );

        const [resultado] =
          await listarRecetas();

        expect(
          resultado.piezas[0].stock
        ).toBe(0);

        expect(resultado.viable).toBe(
          false
        );
      }
    );

    it(
      "PF-REC-13: calcula cuántas piezas del almacén cumplen cada hueco",
      async () => {
        configurarListado(
          [recetaBD()],
          [
            {
              nombre: "Camisa 1",
              tipo: "CAMISA",
              color: "rojo",
              disfrazActualId:
                "almacen-1",
            },

            {
              nombre: "Camisa 2",
              tipo: "CAMISA",
              color: "rojo",
              disfrazActualId:
                "almacen-1",
            },

            {
              nombre: "Camisa azul",
              tipo: "CAMISA",
              color: "azul",
              disfrazActualId:
                "almacen-1",
            },
          ]
        );

        const [resultado] =
          await listarRecetas();

        expect(
          resultado.piezas[0].stock
        ).toBe(2);
      }
    );

    it(
      "PF-REC-14: una receta es viable cuando todos sus huecos obligatorios tienen stock",
      async () => {
        configurarListado(
          [
            recetaBD({
              piezas: [
                {
                  id: "h1",
                  etiqueta: "Camisa",
                  tipo: "CAMISA",
                  colores: ["rojo"],
                  nombreContiene: null,
                  obligatoria: true,
                },

                {
                  id: "h2",
                  etiqueta: "Sombrero",
                  tipo: "SOMBRERO",
                  colores: [],
                  nombreContiene: null,
                  obligatoria: false,
                },
              ],
            }),
          ],
          [
            {
              nombre: "Camisa roja",
              tipo: "CAMISA",
              color: "rojo",
              disfrazActualId:
                "almacen-1",
            },
          ]
        );

        const [resultado] =
          await listarRecetas();

        expect(resultado.viable).toBe(
          true
        );
      }
    );

    it(
      "PF-REC-15: una receta no es viable cuando falta stock para un hueco obligatorio",
      async () => {
        configurarListado(
          [recetaBD()],
          []
        );

        const [resultado] =
          await listarRecetas();

        expect(resultado.viable).toBe(
          false
        );
      }
    );

    it(
      "PF-REC-16: una receta sin huecos obligatorios es viable aunque no haya stock",
      async () => {
        configurarListado(
          [
            recetaBD({
              piezas: [
                {
                  id: "h1",
                  etiqueta: "Sombrero",
                  tipo: "SOMBRERO",
                  colores: [],
                  nombreContiene: null,
                  obligatoria: false,
                },
              ],
            }),
          ],
          []
        );

        const [resultado] =
          await listarRecetas();

        expect(resultado.viable).toBe(
          true
        );
      }
    );

    it(
      "PF-REC-17: ordena los huecos de la cabeza a los pies",
      async () => {
        configurarListado([
          recetaBD({
            piezas: [
              {
                id: "pantalon",
                etiqueta: "Pantalón",
                tipo: "PANTALON",
                colores: [],
                nombreContiene: null,
                obligatoria: false,
              },

              {
                id: "sombrero",
                etiqueta: "Sombrero",
                tipo: "SOMBRERO",
                colores: [],
                nombreContiene: null,
                obligatoria: false,
              },

              {
                id: "camisa",
                etiqueta: "Camisa",
                tipo: "CAMISA",
                colores: [],
                nombreContiene: null,
                obligatoria: false,
              },
            ],
          }),
        ]);

        const [resultado] =
          await listarRecetas();

        expect(
          resultado.piezas.map(
            (p) => p.tipo
          )
        ).toEqual([
          "SOMBRERO",
          "CAMISA",
          "PANTALON",
        ]);
      }
    );

    // ========================================================
    // CREAR RECETA
    // ========================================================

    it(
      "PF-REC-18: rechaza una receta sin palabras clave válidas",
      async () => {
        await expect(
          crearReceta(
            datosReceta({
              palabrasClave: [
                "",
                "   ",
              ],
            }) as any
          )
        ).rejects.toBeInstanceOf(
          ErrorReceta
        );

        expect(
          prisma.receta.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-REC-19: normaliza y elimina palabras clave duplicadas antes de crear",
      async () => {
        configurarCreacionExitosa();

        await crearReceta(
          datosReceta({
            palabrasClave: [
              " BOMBERO ",
              "bombero",
              "Bómberos",
            ],
          }) as any
        );

        const llamada = vi.mocked(
          prisma.receta.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data.palabrasClave
        ).toEqual([
          "bombero",
          "bomberos",
        ]);
      }
    );

    it(
      "PF-REC-20: normaliza descripción, colores y nombreContiene al crear una receta",
      async () => {
        configurarCreacionExitosa();

        await crearReceta(
          datosReceta({
            descripcion: "",

            piezas: [
              {
                etiqueta: "Camisa",
                tipo: "CAMISA",

                colores: [
                  " Rojo ",
                  "rojo",
                  "",
                  " AZUL ",
                ],

                nombreContiene:
                  "  bombero  ",

                obligatoria: true,
              },
            ],
          }) as any
        );

        const llamada = vi.mocked(
          prisma.receta.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data.descripcion
        ).toBeNull();

        expect(
          llamada.data.piezas.create[0]
            .colores
        ).toEqual([
          "rojo",
          "azul",
        ]);

        expect(
          llamada.data.piezas.create[0]
            .nombreContiene
        ).toBe("bombero");
      }
    );

    it(
      "PF-REC-21: rechaza una palabra clave que ya pertenece a otra receta",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          {
            nombre: "Policía",
            palabrasClave: [
              "policia",
              "oficial",
            ],
          },
        ] as any);

        await expect(
          crearReceta(
            datosReceta({
              palabrasClave: [
                "policia",
              ],
            }) as any
          )
        ).rejects.toMatchObject({
          estado: 409,
        });

        await expect(
          crearReceta(
            datosReceta({
              palabrasClave: [
                "policia",
              ],
            }) as any
          )
        ).rejects.toThrow(
          "ya pertenece a la receta"
        );

        expect(
          prisma.receta.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-REC-22: crea la receta con sus piezas anidadas",
      async () => {
        configurarCreacionExitosa();

        await crearReceta(
          datosReceta() as any
        );

        expect(
          prisma.receta.create
        ).toHaveBeenCalledWith({
          data: {
            nombre: "Bombero",
            descripcion:
              "Disfraz de bombero",

            palabrasClave: [
              "bombero",
              "bomberos",
            ],

            precioDia: 50,
            activa: true,

            piezas: {
              create: [
                {
                  etiqueta:
                    "Camisa roja",
                  tipo: "CAMISA",
                  colores: ["rojo"],
                  nombreContiene: null,
                  obligatoria: true,
                },
              ],
            },
          },
        });
      }
    );

    it(
      "PF-REC-23: vincula peticiones pendientes cuando se crea una receta activa",
      async () => {
        configurarCreacionExitosa();

        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          {
            id: "pet-1",
            textoNormalizado:
              "quiero bombero",
          },

          {
            id: "pet-2",
            textoNormalizado:
              "bombero rojo",
          },

          {
            id: "pet-3",
            textoNormalizado:
              "astronauta",
          },
        ] as any);

        const resultado =
          await crearReceta(
            datosReceta() as any
          );

        expect(
          prisma.peticionDisfraz.updateMany
        ).toHaveBeenCalledWith({
          where: {
            id: {
              in: [
                "pet-1",
                "pet-2",
              ],
            },
          },

          data: {
            recetaId: "receta-1",
            atendida: true,
          },
        });

        expect(
          resultado.peticionesVinculadas
        ).toBe(2);
      }
    );

    it(
      "PF-REC-24: no vincula peticiones cuando la receta se crea inactiva",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        )
          .mockResolvedValueOnce([] as any)
          .mockResolvedValueOnce([
            recetaBD({
              activa: false,
            }),
          ] as any);

        vi.mocked(
          prisma.receta.create
        ).mockResolvedValue({
          id: "receta-1",
        } as any);

        almacenExiste();

        const resultado =
          await crearReceta(
            datosReceta({
              activa: false,
            }) as any
          );

        expect(
          prisma.peticionDisfraz.findMany
        ).not.toHaveBeenCalled();

        expect(
          resultado.peticionesVinculadas
        ).toBe(0);
      }
    );

    it(
      "PF-REC-25: no actualiza peticiones cuando ninguna coincide con las palabras clave",
      async () => {
        configurarCreacionExitosa();

        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          {
            id: "pet-1",
            textoNormalizado:
              "astronauta espacial",
          },
        ] as any);

        const resultado =
          await crearReceta(
            datosReceta() as any
          );

        expect(
          prisma.peticionDisfraz.updateMany
        ).not.toHaveBeenCalled();

        expect(
          resultado.peticionesVinculadas
        ).toBe(0);
      }
    );

    it(
      "PF-REC-26: traduce el error Prisma P2002 a nombre de receta duplicado",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        const error =
          new Prisma.PrismaClientKnownRequestError(
            "Unique constraint",
            {
              code: "P2002",
              clientVersion: "5.22.0",
            }
          );

        vi.mocked(
          prisma.receta.create
        ).mockRejectedValue(error);

        await expect(
          crearReceta(
            datosReceta() as any
          )
        ).rejects.toMatchObject({
          estado: 409,
          message:
            "Ya existe una receta con ese nombre.",
        });
      }
    );

    it(
      "PF-REC-27: propaga errores de creación que no sean P2002",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.receta.create
        ).mockRejectedValue(
          new Error(
            "Fallo inesperado"
          )
        );

        await expect(
          crearReceta(
            datosReceta() as any
          )
        ).rejects.toThrow(
          "Fallo inesperado"
        );
      }
    );

    // ========================================================
    // ACTUALIZAR RECETA
    // ========================================================

    it(
      "PF-REC-28: rechaza actualizar una receta inexistente",
      async () => {
        vi.mocked(
          prisma.receta.findUnique
        ).mockResolvedValue(null);

        await expect(
          actualizarReceta(
            "inexistente",
            datosReceta() as any
          )
        ).rejects.toMatchObject({
          estado: 404,
          message:
            "Receta no encontrada",
        });

        expect(
          prisma.$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-REC-29: al validar palabras clave durante la edición excluye la receta actual",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        )
          .mockResolvedValueOnce([] as any)
          .mockResolvedValueOnce([
            recetaBD(),
          ] as any);

        vi.mocked(
          prisma.$transaction
        ).mockResolvedValue([] as any);

        almacenExiste();

        await actualizarReceta(
          "receta-1",
          datosReceta() as any
        );

        expect(
          prisma.receta.findMany
        ).toHaveBeenNthCalledWith(
          1,
          {
            where: {
              id: {
                not: "receta-1",
              },
            },

            select: {
              nombre: true,
              palabrasClave: true,
            },
          }
        );
      }
    );

    it(
      "PF-REC-30: reemplaza las piezas de una receta dentro de una transacción",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        )
          .mockResolvedValueOnce([] as any)
          .mockResolvedValueOnce([
            recetaBD(),
          ] as any);

        almacenExiste();

        await actualizarReceta(
          "receta-1",
          datosReceta() as any
        );

        expect(
          prisma.recetaPieza.deleteMany
        ).toHaveBeenCalledWith({
          where: {
            recetaId: "receta-1",
          },
        });

        expect(
          prisma.receta.update
        ).toHaveBeenCalledWith({
          where: {
            id: "receta-1",
          },

          data: expect.objectContaining({
            nombre: "Bombero",
            activa: true,

            piezas: {
              create:
                expect.any(Array),
            },
          }),
        });

        expect(
          prisma.$transaction
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "PF-REC-31: una receta activa actualizada vincula peticiones antiguas coincidentes",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        )
          .mockResolvedValueOnce([] as any)
          .mockResolvedValueOnce([
            recetaBD(),
          ] as any);

        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          {
            id: "pet-1",
            textoNormalizado:
              "necesito bombero",
          },
        ] as any);

        almacenExiste();

        const resultado =
          await actualizarReceta(
            "receta-1",
            datosReceta() as any
          );

        expect(
          resultado.peticionesVinculadas
        ).toBe(1);
      }
    );

    it(
      "PF-REC-32: una receta inactiva actualizada no intenta vincular peticiones",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        )
          .mockResolvedValueOnce([] as any)
          .mockResolvedValueOnce([
            recetaBD({
              activa: false,
            }),
          ] as any);

        almacenExiste();

        const resultado =
          await actualizarReceta(
            "receta-1",
            datosReceta({
              activa: false,
            }) as any
          );

        expect(
          prisma.peticionDisfraz.findMany
        ).not.toHaveBeenCalled();

        expect(
          resultado.peticionesVinculadas
        ).toBe(0);
      }
    );

    it(
      "PF-REC-33: traduce P2002 durante la actualización",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

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

        await expect(
          actualizarReceta(
            "receta-1",
            datosReceta() as any
          )
        ).rejects.toMatchObject({
          estado: 409,
          message:
            "Ya existe una receta con ese nombre.",
        });
      }
    );

    // ========================================================
    // CAMBIAR ACTIVA
    // ========================================================

    it(
      "PF-REC-34: rechaza cambiar el estado de una receta inexistente",
      async () => {
        vi.mocked(
          prisma.receta.findUnique
        ).mockResolvedValue(null);

        await expect(
          cambiarActiva(
            "inexistente",
            true
          )
        ).rejects.toMatchObject({
          estado: 404,
        });

        expect(
          prisma.receta.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-REC-35: activa o desactiva una receta y devuelve su stock actualizado",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          recetaBD({
            activa: false,
          }),
        ] as any);

        configurarListado(
          [
            recetaBD({
              activa: false,
            }),
          ],
          [
            {
              nombre: "Camisa roja",
              tipo: "CAMISA",
              color: "rojo",
              disfrazActualId:
                "almacen-1",
            },
          ]
        );

        const resultado =
          await cambiarActiva(
            "receta-1",
            false
          );

        expect(
          prisma.receta.update
        ).toHaveBeenCalledWith({
          where: {
            id: "receta-1",
          },

          data: {
            activa: false,
          },
        });

        expect(resultado.id).toBe(
          "receta-1"
        );

        expect(
          resultado.piezas[0].stock
        ).toBe(1);
      }
    );

    // ========================================================
    // ELIMINAR RECETA
    // ========================================================

    it(
      "PF-REC-36: rechaza eliminar una receta inexistente",
      async () => {
        vi.mocked(
          prisma.receta.findUnique
        ).mockResolvedValue(null);

        await expect(
          eliminarReceta(
            "inexistente"
          )
        ).rejects.toMatchObject({
          estado: 404,
          message:
            "Receta no encontrada",
        });

        expect(
          prisma.reserva.count
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-REC-37: impide eliminar una receta que ya fue utilizada en reservas",
      async () => {
        vi.mocked(
          prisma.reserva.count
        ).mockResolvedValue(2);

        await expect(
          eliminarReceta(
            "receta-1"
          )
        ).rejects.toMatchObject({
          estado: 409,
        });

        await expect(
          eliminarReceta(
            "receta-1"
          )
        ).rejects.toThrow(
          "desactívala en vez de eliminarla"
        );

        expect(
          prisma.$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-REC-38: consulta las reservas asociadas antes de eliminar",
      async () => {
        await eliminarReceta(
          "receta-1"
        );

        expect(
          prisma.reserva.count
        ).toHaveBeenCalledWith({
          where: {
            recetaId: "receta-1",
          },
        });
      }
    );

    it(
      "PF-REC-39: al eliminar una receta devuelve sus peticiones al estado sin receta",
      async () => {
        await eliminarReceta(
          "receta-1"
        );

        expect(
          prisma.peticionDisfraz.updateMany
        ).toHaveBeenCalledWith({
          where: {
            recetaId: "receta-1",
          },

          data: {
            recetaId: null,
            atendida: false,
          },
        });
      }
    );

    it(
      "PF-REC-40: elimina la receta y actualiza sus peticiones dentro de una misma transacción",
      async () => {
        await eliminarReceta(
          "receta-1"
        );

        expect(
          prisma.receta.delete
        ).toHaveBeenCalledWith({
          where: {
            id: "receta-1",
          },
        });

        expect(
          prisma.$transaction
        ).toHaveBeenCalledTimes(1);

        const operaciones = vi.mocked(
        prisma.$transaction
        ).mock.calls[0][0] as unknown as any[];

        expect(operaciones).toHaveLength(
          2
        );
      }
    );
  }
);