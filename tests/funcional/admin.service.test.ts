import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    peticionDisfraz: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },

    reserva: {
      findMany: vi.fn(),
    },

    prenda: {
      findMany: vi.fn(),
    },

    disfrazFisico: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock(
  "../../src/modules/disfraces/disfraces.service",
  () => ({
    limpiarSuspensionesVencidas: vi.fn(),
    infoLavado: vi.fn(),
    fechaLiberacionLavado: vi.fn(),
  })
);

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../src/config/prisma";

import {
  limpiarSuspensionesVencidas,
  infoLavado,
  fechaLiberacionLavado,
} from "../../src/modules/disfraces/disfraces.service";

import {
  ErrorAdminAMedida,
  listarDemanda,
  marcarDemandaAtendida,
  listarEnCurso,
} from "../../src/modules/a-medida/admin.service";

// ============================================================
// HELPERS
// ============================================================

function filaDemanda(
  overrides: Record<string, any> = {}
) {
  return {
    textoNormalizado: "astronauta",
    texto: "Astronauta",
    usuarioId: "usuario-1",
    creadoEn: new Date(
      "2026-10-20T10:00:00.000Z"
    ),
    ...overrides,
  };
}

function reservaEnCurso(
  overrides: Record<string, any> = {}
) {
  return {
    id: "reserva-1",
    tipo: "A_MEDIDA",
    confirmadaEn: new Date(
      "2026-10-20T10:00:00.000Z"
    ),
    disfrazFisicoId: "disfraz-1",

    disfrazFisico: {
      id: "disfraz-1",
      nombre: "Bombero a medida #ABCD",
      estadoManual: null,
      fechaSuspension: null,
      alquileres: [],
    },

    ...overrides,
  };
}

function prenda(
  overrides: Record<string, any> = {}
) {
  return {
    id: "prenda-1",
    nombre: "Camisa roja",
    talla: "M",
    estado: "DISPONIBLE",
    disfrazActualId: "disfraz-1",
    disfrazHogarId: "almacen-1",
    ...overrides,
  };
}

// ============================================================
// TESTS
// ============================================================

describe(
  "AdminService - administración de disfraces a medida",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        prisma.peticionDisfraz.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.peticionDisfraz.count
      ).mockResolvedValue(0);

      vi.mocked(
        prisma.peticionDisfraz.updateMany
      ).mockResolvedValue({
        count: 1,
      } as any);

      vi.mocked(
        limpiarSuspensionesVencidas
      ).mockResolvedValue(undefined as any);

      vi.mocked(
        prisma.reserva.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.prenda.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.disfrazFisico.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        infoLavado
      ).mockReturnValue({
        dias: 1,
        fase: "LAVADO",
      } as any);

      vi.mocked(
        fechaLiberacionLavado
      ).mockReturnValue(
        new Date(
          "2026-10-23T10:00:00.000Z"
        )
      );
    });

    // ========================================================
    // LISTAR DEMANDA
    // ========================================================

    it(
      "PF-ADM-01: consulta únicamente pedidos pendientes sin receta",
      async () => {
        await listarDemanda();

        expect(
          prisma.peticionDisfraz.findMany
        ).toHaveBeenCalledWith({
          where: {
            recetaId: null,
            atendida: false,
          },

          select: {
            textoNormalizado: true,
            texto: true,
            usuarioId: true,
            creadoEn: true,
          },

          orderBy: {
            creadoEn: "desc",
          },

          take: 2000,
        });
      }
    );

    it(
      "PF-ADM-02: devuelve resumen vacío cuando no existen peticiones",
      async () => {
        const resultado =
          await listarDemanda();

        expect(resultado.grupos).toEqual([]);

        expect(resultado.resumen).toEqual({
          pedidosPendientes: 0,
          gruposPendientes: 0,
          totalPedidos: 0,
          conReceta: 0,
          atendidosSinReceta: 0,
        });

        expect(resultado.truncado).toBe(
          false
        );
      }
    );

    it(
      "PF-ADM-03: obtiene las métricas generales de demanda",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.count
        )
          .mockResolvedValueOnce(25)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(4);

        const resultado =
          await listarDemanda();

        expect(resultado.resumen).toEqual({
          pedidosPendientes: 0,
          gruposPendientes: 0,
          totalPedidos: 25,
          conReceta: 10,
          atendidosSinReceta: 4,
        });

        expect(
          prisma.peticionDisfraz.count
        ).toHaveBeenNthCalledWith(
          1
        );

        expect(
          prisma.peticionDisfraz.count
        ).toHaveBeenNthCalledWith(
          2,
          {
            where: {
              recetaId: {
                not: null,
              },
            },
          }
        );

        expect(
          prisma.peticionDisfraz.count
        ).toHaveBeenNthCalledWith(
          3,
          {
            where: {
              recetaId: null,
              atendida: true,
            },
          }
        );
      }
    );

    it(
      "PF-ADM-04: agrupa peticiones por texto normalizado",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          filaDemanda({
            usuarioId: "u1",
            texto: "Astronauta",
          }),

          filaDemanda({
            usuarioId: "u2",
            texto: "Quiero astronauta",
          }),

          filaDemanda({
            usuarioId: "u1",
            texto: "Un astronauta",
          }),
        ] as any);

        const resultado =
          await listarDemanda();

        expect(resultado.grupos).toHaveLength(
          1
        );

        expect(resultado.grupos[0]).toMatchObject({
          textoNormalizado: "astronauta",
          veces: 3,
          personas: 2,
        });
      }
    );

    it(
      "PF-ADM-05: calcula correctamente la primera y última fecha de cada grupo",
      async () => {
        const primera = new Date(
          "2026-10-01T10:00:00.000Z"
        );

        const intermedia = new Date(
          "2026-10-10T10:00:00.000Z"
        );

        const ultima = new Date(
          "2026-10-20T10:00:00.000Z"
        );

        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          filaDemanda({
            creadoEn: intermedia,
          }),

          filaDemanda({
            creadoEn: primera,
          }),

          filaDemanda({
            creadoEn: ultima,
          }),
        ] as any);

        const resultado =
          await listarDemanda();

        expect(
          resultado.grupos[0].primera
        ).toEqual(primera);

        expect(
          resultado.grupos[0].ultima
        ).toEqual(ultima);
      }
    );

    it(
      "PF-ADM-06: guarda como máximo tres ejemplos distintos y elimina espacios externos",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          filaDemanda({
            texto: "  Astronauta  ",
          }),

          filaDemanda({
            texto: "Astronauta",
          }),

          filaDemanda({
            texto: "Traje astronauta",
          }),

          filaDemanda({
            texto: "Quiero astronauta",
          }),

          filaDemanda({
            texto: "Astronauta espacial",
          }),
        ] as any);

        const resultado =
          await listarDemanda();

        expect(
          resultado.grupos[0].ejemplos
        ).toEqual([
          "Astronauta",
          "Traje astronauta",
          "Quiero astronauta",
        ]);
      }
    );

    it(
      "PF-ADM-07: ordena los grupos por cantidad de peticiones de mayor a menor",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          filaDemanda({
            textoNormalizado: "pirata",
            texto: "Pirata",
            usuarioId: "u1",
          }),

          filaDemanda({
            textoNormalizado: "astronauta",
            texto: "Astronauta",
            usuarioId: "u1",
          }),

          filaDemanda({
            textoNormalizado: "astronauta",
            texto: "Astronauta",
            usuarioId: "u2",
          }),
        ] as any);

        const resultado =
          await listarDemanda();

        expect(
          resultado.grupos.map(
            (g) => g.textoNormalizado
          )
        ).toEqual([
          "astronauta",
          "pirata",
        ]);
      }
    );

    it(
      "PF-ADM-08: a igualdad de peticiones ordena por mayor cantidad de personas",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          filaDemanda({
            textoNormalizado: "pirata",
            texto: "Pirata",
            usuarioId: "u1",
          }),

          filaDemanda({
            textoNormalizado: "pirata",
            texto: "Pirata otra vez",
            usuarioId: "u1",
          }),

          filaDemanda({
            textoNormalizado: "astronauta",
            texto: "Astronauta",
            usuarioId: "u1",
          }),

          filaDemanda({
            textoNormalizado: "astronauta",
            texto: "Astronauta",
            usuarioId: "u2",
          }),
        ] as any);

        const resultado =
          await listarDemanda();

        expect(
          resultado.grupos[0]
            .textoNormalizado
        ).toBe("astronauta");

        expect(
          resultado.grupos[0].personas
        ).toBe(2);
      }
    );

    it(
      "PF-ADM-09: a igualdad de peticiones y personas ordena por la solicitud más reciente",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue([
          filaDemanda({
            textoNormalizado: "pirata",
            texto: "Pirata",
            usuarioId: "u1",
            creadoEn: new Date(
              "2026-10-10T10:00:00.000Z"
            ),
          }),

          filaDemanda({
            textoNormalizado: "astronauta",
            texto: "Astronauta",
            usuarioId: "u2",
            creadoEn: new Date(
              "2026-10-20T10:00:00.000Z"
            ),
          }),
        ] as any);

        const resultado =
          await listarDemanda();

        expect(
          resultado.grupos[0]
            .textoNormalizado
        ).toBe("astronauta");
      }
    );

    it(
      "PF-ADM-10: informa que el resultado está truncado al alcanzar 2000 peticiones",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.findMany
        ).mockResolvedValue(
          Array.from(
            { length: 2000 },
            (_, index) =>
              filaDemanda({
                textoNormalizado:
                  `pedido-${index}`,
                texto:
                  `Pedido ${index}`,
                usuarioId:
                  `usuario-${index}`,
              })
          ) as any
        );

        const resultado =
          await listarDemanda();

        expect(resultado.truncado).toBe(
          true
        );

        expect(
          resultado.resumen
            .pedidosPendientes
        ).toBe(2000);
      }
    );

    // ========================================================
    // MARCAR DEMANDA ATENDIDA
    // ========================================================

    it(
      "PF-ADM-11: rechaza un texto vacío al marcar demanda como atendida",
      async () => {
        await expect(
          marcarDemandaAtendida("   ")
        ).rejects.toMatchObject({
          estado: 400,
        });

        await expect(
          marcarDemandaAtendida("   ")
        ).rejects.toThrow(
          "Falta indicar qué pedido se marca como atendido."
        );

        expect(
          prisma.peticionDisfraz.updateMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-ADM-12: marca todas las peticiones pendientes del texto indicado",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.updateMany
        ).mockResolvedValue({
          count: 4,
        } as any);

        const resultado =
          await marcarDemandaAtendida(
            "  astronauta  "
          );

        expect(
          prisma.peticionDisfraz.updateMany
        ).toHaveBeenCalledWith({
          where: {
            textoNormalizado:
              "astronauta",
            recetaId: null,
            atendida: false,
          },

          data: {
            atendida: true,
          },
        });

        expect(resultado).toEqual({
          marcados: 4,
        });
      }
    );

    it(
      "PF-ADM-13: devuelve 404 cuando no existen peticiones pendientes con ese texto",
      async () => {
        vi.mocked(
          prisma.peticionDisfraz.updateMany
        ).mockResolvedValue({
          count: 0,
        } as any);

        await expect(
          marcarDemandaAtendida(
            "astronauta"
          )
        ).rejects.toMatchObject({
          estado: 404,
        });

        await expect(
          marcarDemandaAtendida(
            "astronauta"
          )
        ).rejects.toThrow(
          "No hay pedidos pendientes con ese texto."
        );
      }
    );

    // ========================================================
    // LISTAR EN CURSO
    // ========================================================

    it(
      "PF-ADM-14: ejecuta la limpieza de suspensiones antes de listar reservas en curso",
      async () => {
        await listarEnCurso();

        expect(
          limpiarSuspensionesVencidas
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "PF-ADM-15: consulta únicamente reservas confirmadas de tipo A_MEDIDA o AJUSTE_TALLA",
      async () => {
        await listarEnCurso();

        expect(
          prisma.reserva.findMany
        ).toHaveBeenCalledWith({
          where: {
            confirmadaEn: {
              not: null,
            },

            liberadaEn: null,

            tipo: {
              in: [
                "A_MEDIDA",
                "AJUSTE_TALLA",
              ],
            },
          },

          orderBy: {
            confirmadaEn: "desc",
          },

          select: {
            id: true,
            tipo: true,
            confirmadaEn: true,
            disfrazFisicoId: true,

            disfrazFisico: {
              select: {
                id: true,
                nombre: true,
                estadoManual: true,
                fechaSuspension: true,

                alquileres: {
                  select: {
                    alquiler: {
                      select: {
                        id: true,
                        estado: true,
                        fechaInicio: true,
                        fechaFin: true,

                        usuario: {
                          select: {
                            nombre: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
      }
    );

    it(
      "PF-ADM-16: devuelve inmediatamente una lista vacía cuando no existen reservas en curso",
      async () => {
        const resultado =
          await listarEnCurso();

        expect(resultado).toEqual([]);

        expect(
          prisma.prenda.findMany
        ).not.toHaveBeenCalled();

        expect(
          prisma.disfrazFisico.findMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-ADM-17: obtiene las prendas actuales de los disfraces en curso",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            id: "r1",
            disfrazFisicoId: "d1",

            disfrazFisico: {
              id: "d1",
              nombre: "Disfraz 1",
              estadoManual: null,
              fechaSuspension: null,
              alquileres: [],
            },
          }),

          reservaEnCurso({
            id: "r2",
            disfrazFisicoId: "d2",

            disfrazFisico: {
              id: "d2",
              nombre: "Disfraz 2",
              estadoManual: null,
              fechaSuspension: null,
              alquileres: [],
            },
          }),
        ] as any);

        await listarEnCurso();

        expect(
          prisma.prenda.findMany
        ).toHaveBeenCalledWith({
          where: {
            disfrazActualId: {
              in: ["d1", "d2"],
            },
          },

          select: {
            id: true,
            nombre: true,
            talla: true,
            estado: true,
            disfrazActualId: true,
            disfrazHogarId: true,
          },
        });
      }
    );

    it(
      "PF-ADM-18: consulta una sola vez cada hogar de procedencia de las prendas",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso(),
        ] as any);

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          prenda({
            id: "p1",
            disfrazHogarId:
              "donante-1",
          }),

          prenda({
            id: "p2",
            disfrazHogarId:
              "donante-1",
          }),

          prenda({
            id: "p3",
            disfrazHogarId:
              "donante-2",
          }),
        ] as any);

        await listarEnCurso();

        expect(
          prisma.disfrazFisico.findMany
        ).toHaveBeenCalledWith({
          where: {
            id: {
              in: [
                "donante-1",
                "donante-2",
              ],
            },
          },

          select: {
            id: true,
            nombre: true,
          },
        });
      }
    );

    it(
      "PF-ADM-19: una reserva con alquiler ACTIVO aparece como ALQUILADO",
      async () => {
        const usuario = {
          nombre: "Mauro",
          email: "mauro@test.com",
        };

        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: null,
              fechaSuspension: null,

              alquileres: [
                {
                  alquiler: {
                    id: "alq-1",
                    estado: "ACTIVO",
                    fechaInicio:
                      new Date(
                        "2026-10-20T00:00:00Z"
                      ),
                    fechaFin:
                      new Date(
                        "2026-10-25T00:00:00Z"
                      ),
                    usuario,
                  },
                },
              ],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.estado).toBe(
          "ALQUILADO"
        );

        expect(resultado.cliente).toEqual(
          usuario
        );

        expect(resultado.alquiler).toMatchObject({
          id: "alq-1",
          estado: "ACTIVO",
        });

        expect(resultado.lavado).toBeNull();
      }
    );

    it(
      "PF-ADM-20: un alquiler PENDIENTE también tiene prioridad como ALQUILADO",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: "SUSPENDIDO",

              fechaSuspension:
                new Date(
                  "2026-10-20T00:00:00Z"
                ),

              alquileres: [
                {
                  alquiler: {
                    id: "alq-1",
                    estado: "PENDIENTE",
                    fechaInicio: null,
                    fechaFin: null,

                    usuario: {
                      nombre: "Cliente",
                      email:
                        "cliente@test.com",
                    },
                  },
                },
              ],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.estado).toBe(
          "ALQUILADO"
        );
      }
    );

    it(
      "PF-ADM-21: usa el alquiler activo aunque no sea el último del historial",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: null,
              fechaSuspension: null,

              alquileres: [
                {
                  alquiler: {
                    id: "activo",
                    estado: "ACTIVO",
                    fechaInicio: null,
                    fechaFin: null,

                    usuario: {
                      nombre:
                        "Cliente activo",
                      email:
                        "activo@test.com",
                    },
                  },
                },

                {
                  alquiler: {
                    id: "antiguo",
                    estado: "FINALIZADO",
                    fechaInicio: null,
                    fechaFin: null,

                    usuario: {
                      nombre:
                        "Cliente antiguo",
                      email:
                        "antiguo@test.com",
                    },
                  },
                },
              ],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(
          resultado.alquiler?.id
        ).toBe("activo");

        expect(
          resultado.cliente?.nombre
        ).toBe("Cliente activo");
      }
    );

    it(
      "PF-ADM-22: sin alquiler activo utiliza el último alquiler como referencia",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: null,
              fechaSuspension: null,

              alquileres: [
                {
                  alquiler: {
                    id: "alq-1",
                    estado: "FINALIZADO",
                    fechaInicio: null,
                    fechaFin: null,

                    usuario: {
                      nombre: "Cliente 1",
                      email:
                        "c1@test.com",
                    },
                  },
                },

                {
                  alquiler: {
                    id: "alq-2",
                    estado: "FINALIZADO",
                    fechaInicio: null,
                    fechaFin: null,

                    usuario: {
                      nombre: "Cliente 2",
                      email:
                        "c2@test.com",
                    },
                  },
                },
              ],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.estado).toBe(
          "POR_DESARMAR"
        );

        expect(
          resultado.alquiler?.id
        ).toBe("alq-2");

        expect(
          resultado.cliente?.nombre
        ).toBe("Cliente 2");
      }
    );

    it(
      "PF-ADM-23: sin historial de alquiler devuelve cliente y alquiler null",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso(),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.estado).toBe(
          "POR_DESARMAR"
        );

        expect(resultado.cliente).toBeNull();

        expect(resultado.alquiler).toBeNull();
      }
    );

    it(
      "PF-ADM-24: identifica un disfraz suspendido como EN_LAVADO y calcula su información de lavado",
      async () => {
        const suspension =
          new Date(
            "2026-10-20T10:00:00.000Z"
          );

        const liberacion =
          new Date(
            "2026-10-23T10:00:00.000Z"
          );

        vi.mocked(
          infoLavado
        ).mockReturnValue({
          dias: 2,
          fase: "PLANCHADO",
        } as any);

        vi.mocked(
          fechaLiberacionLavado
        ).mockReturnValue(
          liberacion
        );

        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: "SUSPENDIDO",
              fechaSuspension: suspension,
              alquileres: [],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.estado).toBe(
          "EN_LAVADO"
        );

        expect(resultado.lavado).toEqual({
          dias: 2,
          fase: "PLANCHADO",
          liberaEl: liberacion,
        });

        expect(
          infoLavado
        ).toHaveBeenCalledWith(
          suspension
        );

        expect(
          fechaLiberacionLavado
        ).toHaveBeenCalledWith(
          suspension
        );
      }
    );

    it(
      "PF-ADM-25: un disfraz suspendido sin fecha de suspensión no se considera en lavado",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: "SUSPENDIDO",
              fechaSuspension: null,
              alquileres: [],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.estado).toBe(
          "POR_DESARMAR"
        );

        expect(resultado.lavado).toBeNull();

        expect(
          infoLavado
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-ADM-26: en A_MEDIDA muestra todas las piezas que están actualmente en el disfraz",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            tipo: "A_MEDIDA",
          }),
        ] as any);

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          prenda({
            id: "p1",
            nombre: "Camisa",
            disfrazActualId:
              "disfraz-1",
            disfrazHogarId:
              "disfraz-1",
          }),

          prenda({
            id: "p2",
            nombre: "Pantalón",
            disfrazActualId:
              "disfraz-1",
            disfrazHogarId:
              "donante-1",
          }),

          prenda({
            id: "p3",
            nombre: "Otra pieza",
            disfrazActualId:
              "otro-disfraz",
            disfrazHogarId:
              "donante-2",
          }),
        ] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "disfraz-1",
            nombre: "Bombero",
          },
          {
            id: "donante-1",
            nombre: "Donante 1",
          },
          {
            id: "donante-2",
            nombre: "Donante 2",
          },
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(
          resultado.piezas.map(
            (p) => p.id
          )
        ).toEqual(["p1", "p2"]);
      }
    );

    it(
      "PF-ADM-27: en AJUSTE_TALLA muestra solo las piezas prestadas desde otro disfraz",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            tipo: "AJUSTE_TALLA",
          }),
        ] as any);

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          prenda({
            id: "propia",
            nombre: "Camisa propia",
            disfrazActualId:
              "disfraz-1",
            disfrazHogarId:
              "disfraz-1",
          }),

          prenda({
            id: "prestada",
            nombre:
              "Camisa prestada",
            disfrazActualId:
              "disfraz-1",
            disfrazHogarId:
              "donante-1",
          }),
        ] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "disfraz-1",
            nombre: "Bombero",
          },

          {
            id: "donante-1",
            nombre: "Policía",
          },
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(
          resultado.piezas
        ).toHaveLength(1);

        expect(
          resultado.piezas[0].id
        ).toBe("prestada");

        expect(
          resultado.piezas[0]
            .procedencia
        ).toBe("Policía");
      }
    );

    it(
      "PF-ADM-28: devuelve procedencia null cuando no encuentra el disfraz de origen",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso(),
        ] as any);

        vi.mocked(
          prisma.prenda.findMany
        ).mockResolvedValue([
          prenda({
            disfrazHogarId:
              "hogar-inexistente",
          }),
        ] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([] as any);

        const [resultado] =
          await listarEnCurso();

        expect(
          resultado.piezas[0]
            .procedencia
        ).toBeNull();
      }
    );

    it(
      "PF-ADM-29: normaliza fechas de inicio y fin ausentes a null",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            disfrazFisico: {
              id: "disfraz-1",
              nombre: "Bombero",
              estadoManual: null,
              fechaSuspension: null,

              alquileres: [
                {
                  alquiler: {
                    id: "alq-1",
                    estado: "FINALIZADO",
                    fechaInicio: undefined,
                    fechaFin: undefined,

                    usuario: {
                      nombre: "Cliente",
                      email:
                        "cliente@test.com",
                    },
                  },
                },
              ],
            },
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado.alquiler).toEqual({
          id: "alq-1",
          estado: "FINALIZADO",
          fechaInicio: null,
          fechaFin: null,
        });
      }
    );

    it(
      "PF-ADM-30: conserva los datos básicos de la reserva y del disfraz",
      async () => {
        const confirmada =
          new Date(
            "2026-10-21T12:00:00.000Z"
          );

        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          reservaEnCurso({
            id: "reserva-especial",
            tipo: "A_MEDIDA",
            confirmadaEn: confirmada,

            disfrazFisico: {
              id: "disfraz-especial",
              nombre:
                "Astronauta a medida",
              estadoManual: null,
              fechaSuspension: null,
              alquileres: [],
            },

            disfrazFisicoId:
              "disfraz-especial",
          }),
        ] as any);

        const [resultado] =
          await listarEnCurso();

        expect(resultado).toMatchObject({
          reservaId:
            "reserva-especial",
          tipo: "A_MEDIDA",
          confirmadaEn: confirmada,

          disfraz: {
            id: "disfraz-especial",
            nombre:
              "Astronauta a medida",
          },

          estado: "POR_DESARMAR",
        });
      }
    );
  }
);