import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },

    prenda: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },

    alquilerDisfraz: {
      findMany: vi.fn(),
    },

    movimientoPrenda: {
      findMany: vi.fn(),
      count: vi.fn(),
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
  obtenerDetalleInventario,
  actualizarEstadoManual,
  actualizarPrenda,
} from "../../../src/modules/disfraces/disfraces.service";

// ============================================================
// HELPERS
// ============================================================

function prendaPropia(
  overrides: Record<string, any> = {}
) {
  return {
    id: "prenda-1",
    nombre: "Capa",
    tipo: "CAPA",
    color: "NEGRO",
    talla: "M",
    calidad: "BUENA",
    estado: "DISPONIBLE",

    disfrazHogarId: "disfraz-1",
    disfrazActualId: "disfraz-1",

    disfrazActual: {
      id: "disfraz-1",
      nombre: "Batman",
      origen: "CATALOGO",
    },

    ...overrides,
  };
}

function prendaPrestadaRecibida(
  overrides: Record<string, any> = {}
) {
  return {
    id: "prestada-1",
    nombre: "Capa de repuesto",
    tipo: "CAPA",
    color: "NEGRO",
    talla: "M",
    calidad: "BUENA",
    estado: "DISPONIBLE",

    disfrazHogarId: "disfraz-2",
    disfrazActualId: "disfraz-1",

    disfrazHogar: {
      id: "disfraz-2",
      nombre: "Batman #2",
    },

    ...overrides,
  };
}

function disfrazInventario(
  overrides: Record<string, any> = {}
) {
  const propia = prendaPropia();

  return {
    id: "disfraz-1",
    nombre: "Batman",
    familia: "Batman",
    grupoCompatibilidad: "batman",
    tipoDisfraz: "SUPERHEROE",
    precioAlquiler: 50,

    origen: "CATALOGO",

    estadoManual: null,
    fechaSuspension: null,

    prendasHogar: [propia],

    prendasActuales: [
      {
        ...propia,

        disfrazHogar: {
          id: "disfraz-1",
          nombre: "Batman",
        },
      },
    ],

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

  // Consulta de limpiarSuspensionesVencidas()
  vi.mocked(
    prisma.disfrazFisico.findMany
  ).mockResolvedValue([] as any);

  vi.mocked(
    prisma.disfrazFisico.updateMany
  ).mockResolvedValue({
    count: 0,
  } as any);
}

function configurarEstados(
  alquilados: string[] = [],
  reservados: string[] = []
) {
  vi.mocked(
    prisma.alquilerDisfraz.findMany
  ).mockResolvedValue(
    alquilados.map((id) => ({
      disfrazFisicoId: id,
    })) as any
  );

  vi.mocked(
    obtenerReservadosIds
  ).mockResolvedValue(
    new Set(reservados) as any
  );
}

// ============================================================
// TESTS
// ============================================================

describe(
  "DisfracesService - inventario físico",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      configurarLimpieza();
      configurarEstados();

      vi.mocked(
        prisma.movimientoPrenda.findMany
      ).mockResolvedValue([] as any);

      vi.mocked(
        prisma.movimientoPrenda.count
      ).mockResolvedValue(0);

      vi.mocked(
        prisma.disfrazFisico.update
      ).mockResolvedValue({} as any);

      vi.mocked(
        prisma.prenda.update
      ).mockResolvedValue({} as any);
    });

    // ========================================================
    // DETALLE DE INVENTARIO
    // ========================================================

    it(
      "PF-DIS-INV-01: devuelve null cuando el disfraz no existe",
      async () => {
        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(null);

        const resultado =
          await obtenerDetalleInventario(
            "inexistente"
          );

        expect(resultado).toBeNull();
      }
    );

    it(
      "PF-DIS-INV-02: identifica una prenda propia disponible como PRESENTE",
      async () => {
        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario() as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(resultado).not.toBeNull();

        expect(resultado!.prendas[0]).toMatchObject({
          id: "prenda-1",
          situacion: "PRESENTE",
          prestadaA: null,
          reemplazo: null,
          apartada: false,
        });

        expect(resultado!.estado).toBe(
          "DISPONIBLE"
        );

        expect(resultado!.faltantes).toBe(0);
        expect(resultado!.completo).toBe(true);
      }
    );

    it(
      "PF-DIS-INV-03: identifica una prenda propia dañada como DANADA cuando no existe reemplazo",
      async () => {
        const propia = prendaPropia({
          estado: "DANADA",
        });

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasHogar: [propia],

            prendasActuales: [
              {
                ...propia,

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },
            ],
          }) as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0].situacion
        ).toBe("DANADA");

        expect(
          resultado!.prendas[0].reemplazo
        ).toBeNull();

        expect(resultado!.estado).toBe(
          "INCOMPLETO"
        );
      }
    );

    it(
      "PF-DIS-INV-04: identifica una prenda faltante como FALTANTE cuando no existe reemplazo",
      async () => {
        const propia = prendaPropia({
          estado: "FALTANTE",
        });

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasHogar: [propia],

            prendasActuales: [
              {
                ...propia,

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },
            ],
          }) as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0].situacion
        ).toBe("FALTANTE");

        expect(resultado!.faltantes).toBe(1);
        expect(resultado!.completo).toBe(false);
      }
    );

    it(
      "PF-DIS-INV-05: identifica una prenda dañada como REEMPLAZADA cuando recibe una pieza disponible del mismo tipo",
      async () => {
        const propia = prendaPropia({
          estado: "DANADA",
        });

        const reemplazo =
          prendaPrestadaRecibida();

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasHogar: [propia],

            prendasActuales: [
              {
                ...propia,

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },

              reemplazo,
            ],
          }) as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0].situacion
        ).toBe("REEMPLAZADA");

        expect(
          resultado!.prendas[0].reemplazo
        ).toEqual({
          id: "prestada-1",
          nombre: "Capa de repuesto",
          color: "NEGRO",
          talla: "M",
          origenId: "disfraz-2",
          origenNombre: "Batman #2",
        });

        expect(
          resultado!.prestamosRecibidos[0]
            .reemplazaA
        ).toBe("prenda-1");

        expect(
          resultado!.prestamosRecibidos[0]
            .sobrante
        ).toBe(false);
      }
    );

    it(
      "PF-DIS-INV-06: no usa como reemplazo una prenda prestada de otro tipo",
      async () => {
        const propia = prendaPropia({
          estado: "DANADA",
          tipo: "CAPA",
        });

        const ajena =
          prendaPrestadaRecibida({
            tipo: "MASCARA",
          });

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasHogar: [propia],
            prendasActuales: [
              {
                ...propia,

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },

              ajena,
            ],
          }) as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0].situacion
        ).toBe("DANADA");

        expect(
          resultado!.prendas[0].reemplazo
        ).toBeNull();

        expect(
          resultado!.prestamosRecibidos[0]
            .sobrante
        ).toBe(true);
      }
    );

    it(
      "PF-DIS-INV-07: identifica una prenda propia prestada a otro disfraz como PRESTADA",
      async () => {
        const propiaPrestada = prendaPropia({
          disfrazActualId: "disfraz-2",

          disfrazActual: {
            id: "disfraz-2",
            nombre: "Batman #2",
            origen: "CATALOGO",
          },
        });

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasHogar: [
              propiaPrestada,
            ],

            prendasActuales: [],
          }) as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0]
        ).toMatchObject({
          situacion: "PRESTADA",

          prestadaA: {
            id: "disfraz-2",
            nombre: "Batman #2",
            aMedida: false,
          },
        });

        expect(
          resultado!.prestamosSalientes
        ).toBe(1);
      }
    );

    it(
      "PF-DIS-INV-08: indica cuando una prenda propia fue prestada a un disfraz a medida",
      async () => {
        const propiaPrestada = prendaPropia({
          disfrazActualId:
            "disfraz-medida-1",

          disfrazActual: {
            id: "disfraz-medida-1",
            nombre: "Disfraz personalizado",
            origen: "A_MEDIDA",
          },
        });

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasHogar: [
              propiaPrestada,
            ],
            prendasActuales: [],
          }) as any
        );

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0].prestadaA
        ).toMatchObject({
          id: "disfraz-medida-1",
          aMedida: true,
        });
      }
    );

    it(
      "PF-DIS-INV-09: marca como apartadas las piezas incluidas en una reserva viva",
      async () => {
        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario() as any
        );

        vi.mocked(
          prisma.movimientoPrenda.findMany
        ).mockResolvedValue([
          {
            prendaId: "prenda-1",
          },
        ] as any);

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prendas[0].apartada
        ).toBe(true);
      }
    );

    it(
      "PF-DIS-INV-10: permite devolver un préstamo recibido cuando ninguna regla lo bloquea",
      async () => {
        const reemplazo =
          prendaPrestadaRecibida();

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasActuales: [
              {
                ...prendaPropia(),

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },

              reemplazo,
            ],
          }) as any
        );

        configurarEstados();

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prestamosRecibidos[0]
            .puedeDevolverse
        ).toBe(true);
      }
    );

    it(
      "PF-DIS-INV-11: bloquea la devolución de una pieza recibida cuando el disfraz actual está alquilado",
      async () => {
        const reemplazo =
          prendaPrestadaRecibida();

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasActuales: [
              {
                ...prendaPropia(),

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },

              reemplazo,
            ],
          }) as any
        );

        configurarEstados(["disfraz-1"]);

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prestamosRecibidos[0]
            .puedeDevolverse
        ).toBe(false);
      }
    );

    it(
      "PF-DIS-INV-12: bloquea la devolución de una pieza recibida cuando su disfraz de origen está alquilado",
      async () => {
        const reemplazo =
          prendaPrestadaRecibida();

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasActuales: [
              {
                ...prendaPropia(),

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },

              reemplazo,
            ],
          }) as any
        );

        configurarEstados(["disfraz-2"]);

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prestamosRecibidos[0]
            .puedeDevolverse
        ).toBe(false);
      }
    );

    it(
      "PF-DIS-INV-13: bloquea la devolución de una pieza recibida cuando está apartada",
      async () => {
        const reemplazo =
          prendaPrestadaRecibida();

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue(
          disfrazInventario({
            prendasActuales: [
              {
                ...prendaPropia(),

                disfrazHogar: {
                  id: "disfraz-1",
                  nombre: "Batman",
                },
              },

              reemplazo,
            ],
          }) as any
        );

        vi.mocked(
          prisma.movimientoPrenda.findMany
        ).mockResolvedValue([
          {
            prendaId: "prestada-1",
          },
        ] as any);

        const resultado =
          await obtenerDetalleInventario(
            "disfraz-1"
          );

        expect(
          resultado!.prestamosRecibidos[0]
            .apartada
        ).toBe(true);

        expect(
          resultado!.prestamosRecibidos[0]
            .puedeDevolverse
        ).toBe(false);
      }
    );

    // ========================================================
    // ESTADO MANUAL
    // ========================================================

    it(
      "PF-DIS-INV-14: actualiza manualmente el estado cuando el disfraz no está alquilado",
      async () => {
        configurarEstados();

        vi.mocked(
          prisma.disfrazFisico.update
        ).mockResolvedValue({
          id: "disfraz-1",
          estadoManual: "EN_REPARACION",
        } as any);

        const resultado =
          await actualizarEstadoManual(
            "disfraz-1",
            "EN_REPARACION"
          );

        expect(
          prisma.disfrazFisico.update
        ).toHaveBeenCalledWith({
          where: {
            id: "disfraz-1",
          },

          data: {
            estadoManual:
              "EN_REPARACION",
          },
        });

        expect(resultado).toMatchObject({
          estadoManual: "EN_REPARACION",
        });
      }
    );

    it(
      "PF-DIS-INV-15: impide cambiar manualmente el estado mientras el disfraz está alquilado",
      async () => {
        configurarEstados(["disfraz-1"]);

        await expect(
          actualizarEstadoManual(
            "disfraz-1",
            "EN_REPARACION"
          )
        ).rejects.toThrow(
          "Este disfraz está alquilado"
        );

        expect(
          prisma.disfrazFisico.update
        ).not.toHaveBeenCalled();
      }
    );

    // ========================================================
    // ACTUALIZACIÓN DE PRENDAS
    // ========================================================

    it(
      "PF-DIS-INV-16: rechaza la actualización cuando la prenda no existe",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(null);

        await expect(
          actualizarPrenda(
            "inexistente",
            {
              estado: "DANADA",
            }
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
      "PF-DIS-INV-17: impide modificar una prenda cuando su disfraz de origen está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaPropia() as any
        );

        configurarEstados(["disfraz-1"]);

        await expect(
          actualizarPrenda(
            "prenda-1",
            {
              estado: "DANADA",
            }
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
      "PF-DIS-INV-18: impide modificar una prenda cuando el disfraz que la tiene prestada está alquilado",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaPropia({
            disfrazHogarId:
              "disfraz-origen",
            disfrazActualId:
              "disfraz-destino",
          }) as any
        );

        configurarEstados([
          "disfraz-destino",
        ]);

        await expect(
          actualizarPrenda(
            "prenda-1",
            {
              estado: "DANADA",
            }
          )
        ).rejects.toThrow(
          "Este disfraz está alquilado"
        );
      }
    );

    it(
      "PF-DIS-INV-19: impide modificar una prenda apartada por una reserva",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaPropia() as any
        );

        configurarEstados();

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(1);

        await expect(
          actualizarPrenda(
            "prenda-1",
            {
              estado: "DANADA",
            }
          )
        ).rejects.toThrow(
          "Esta prenda está apartada por una reserva"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-INV-20: impide modificar una prenda prestada a un disfraz a medida",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaPropia({
            disfrazHogarId:
              "disfraz-1",
            disfrazActualId:
              "medida-1",
          }) as any
        );

        configurarEstados();

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue({
          origen: "A_MEDIDA",
        } as any);

        await expect(
          actualizarPrenda(
            "prenda-1",
            {
              estado: "DANADA",
            }
          )
        ).rejects.toThrow(
          "Esta prenda está en un disfraz a medida"
        );

        expect(
          prisma.prenda.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-DIS-INV-21: permite modificar una prenda prestada a otro disfraz del catálogo",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaPropia({
            disfrazHogarId:
              "disfraz-1",
            disfrazActualId:
              "disfraz-2",
          }) as any
        );

        configurarEstados();

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.disfrazFisico.findUnique
        ).mockResolvedValue({
          origen: "CATALOGO",
        } as any);

        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValue({
          id: "prenda-1",
          estado: "DANADA",
          calidad: "REGULAR",
        } as any);

        const resultado =
          await actualizarPrenda(
            "prenda-1",
            {
              estado: "DANADA",
              calidad: "REGULAR",
            }
          );

        expect(
          prisma.prenda.update
        ).toHaveBeenCalledWith({
          where: {
            id: "prenda-1",
          },

          data: {
            estado: "DANADA",
            calidad: "REGULAR",
          },
        });

        expect(resultado).toMatchObject({
          estado: "DANADA",
          calidad: "REGULAR",
        });
      }
    );

    it(
      "PF-DIS-INV-22: permite modificar normalmente una prenda que permanece en su disfraz de origen",
      async () => {
        vi.mocked(
          prisma.prenda.findUnique
        ).mockResolvedValue(
          prendaPropia() as any
        );

        configurarEstados();

        vi.mocked(
          prisma.movimientoPrenda.count
        ).mockResolvedValue(0);

        vi.mocked(
          prisma.prenda.update
        ).mockResolvedValue({
          id: "prenda-1",
          estado: "DISPONIBLE",
          calidad: "EXCELENTE",
        } as any);

        const resultado =
          await actualizarPrenda(
            "prenda-1",
            {
              calidad: "EXCELENTE",
            }
          );

        expect(
          prisma.prenda.update
        ).toHaveBeenCalledWith({
          where: {
            id: "prenda-1",
          },

          data: {
            calidad: "EXCELENTE",
          },
        });

        expect(resultado).toMatchObject({
          calidad: "EXCELENTE",
        });
      }
    );
  }
);