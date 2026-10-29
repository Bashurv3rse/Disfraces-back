import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    reserva: {
      count: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },

    receta: {
      findUnique: vi.fn(),
    },

    $transaction: vi.fn(),
  },
}));

vi.mock(
  "../../src/modules/a-medida/armado.service",
  () => ({
    proponerArmado: vi.fn(),
  })
);

vi.mock(
  "../../src/modules/a-medida/reservas.base",
  () => ({
    MINUTOS_RESERVA_INICIAL: 15,
    MINUTOS_RESERVA_PAGO: 30,
    liberarReservasVencidas: vi.fn(),
    liberarSinConfirmar: vi.fn(),
  })
);

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../src/config/prisma";
import { proponerArmado } from "../../src/modules/a-medida/armado.service";

import {
  liberarReservasVencidas,
  liberarSinConfirmar,
} from "../../src/modules/a-medida/reservas.base";

import {
  ErrorReserva,
  MAX_RESERVAS_SIN_PAGAR,
  reservarAMedida,
  extenderReserva,
  confirmarReserva,
  cancelarReserva,
  listarReservasActivas,
} from "../../src/modules/a-medida/reservas.service";

// ============================================================
// HELPERS
// ============================================================

function receta(
  overrides: Record<string, any> = {}
) {
  return {
    id: "receta-1",
    nombre: "Bombero",
    precioDia: 50,
    activa: true,
    ...overrides,
  };
}

function propuestaCompleta(
  overrides: Record<string, any> = {}
) {
  return {
    receta: {
      id: "receta-1",
      nombre: "Bombero",
    },

    completo: true,

    piezas: [
      {
        prendaId: "prenda-1",
        origen: "ALMACEN",
        disfrazOrigenId: "almacen-1",
      },
    ],

    faltantes: [],

    ...overrides,
  };
}

function propuestaIncompleta() {
  return {
    receta: {
      id: "receta-1",
      nombre: "Bombero",
    },

    completo: false,

    piezas: [],

    faltantes: [
      {
        motivo:
          "Falta una camisa disponible.",
      },
      {
        motivo:
          "Falta un pantalón compatible.",
      },
    ],
  };
}

function txBase() {
  return {
    alquilerDisfraz: {
      count: vi.fn().mockResolvedValue(0),
    },

    disfrazFisico: {
      create: vi.fn().mockResolvedValue({}),
    },

    reserva: {
      create: vi.fn().mockResolvedValue({
        id: "reserva-1",
      }),
    },

    prenda: {
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },

    movimientoPrenda: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function ejecutarTransaccionCon(
  tx: ReturnType<typeof txBase>
) {
  vi.mocked(
    prisma.$transaction
  ).mockImplementation(
    async (callback: any) =>
      callback(tx)
  );

  return tx;
}

function configurarReservaBase() {
  vi.mocked(
    liberarReservasVencidas
  ).mockResolvedValue(undefined as any);

  vi.mocked(
    prisma.reserva.count
  ).mockResolvedValue(0);

  vi.mocked(
    prisma.receta.findUnique
  ).mockResolvedValue(
    receta() as any
  );

  vi.mocked(
    proponerArmado
  ).mockResolvedValue(
    propuestaCompleta() as any
  );

  ejecutarTransaccionCon(txBase());
}

// ============================================================
// TESTS
// ============================================================

describe(
  "ReservasService - reservas de disfraces a medida",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        liberarReservasVencidas
      ).mockResolvedValue(undefined as any);

      vi.mocked(
        liberarSinConfirmar
      ).mockResolvedValue(true as any);

      vi.mocked(
        prisma.reserva.count
      ).mockResolvedValue(0);

      vi.mocked(
        prisma.receta.findUnique
      ).mockResolvedValue(
        receta() as any
      );

      vi.mocked(
        proponerArmado
      ).mockResolvedValue(
        propuestaCompleta() as any
      );

      vi.mocked(
        prisma.reserva.updateMany
      ).mockResolvedValue({
        count: 1,
      } as any);

      vi.mocked(
        prisma.reserva.findFirst
      ).mockResolvedValue(null);

      vi.mocked(
        prisma.reserva.findMany
      ).mockResolvedValue([] as any);
    });

    // ========================================================
    // RESERVAR A MEDIDA
    // ========================================================

    it(
      "PF-RES-01: libera reservas vencidas antes de intentar crear una nueva",
      async () => {
        ejecutarTransaccionCon(txBase());

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {}
        );

        expect(
          liberarReservasVencidas
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "PF-RES-02: permite reservar cuando el usuario todavía no alcanza el límite de reservas sin pagar",
      async () => {
        vi.mocked(
          prisma.reserva.count
        ).mockResolvedValue(
          MAX_RESERVAS_SIN_PAGAR - 1
        );

        ejecutarTransaccionCon(txBase());

        const resultado =
          await reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          );

        expect(resultado.reservaId).toBe(
          "reserva-1"
        );
      }
    );

    it(
      "PF-RES-03: bloquea nuevas reservas cuando el usuario alcanza el máximo permitido",
      async () => {
        vi.mocked(
          prisma.reserva.count
        ).mockResolvedValue(
          MAX_RESERVAS_SIN_PAGAR
        );

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toMatchObject({
          estado: 409,
        });

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toThrow(
          "disfraces a medida reservados sin pagar"
        );

        expect(
          prisma.receta.findUnique
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-RES-04: consulta solamente reservas activas y no confirmadas para aplicar el límite",
      async () => {
        ejecutarTransaccionCon(txBase());

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {}
        );

        expect(
          prisma.reserva.count
        ).toHaveBeenCalledWith({
          where: {
            usuarioId: "usuario-1",
            liberadaEn: null,
            confirmadaEn: null,
          },
        });
      }
    );

    it(
      "PF-RES-05: rechaza una receta inexistente",
      async () => {
        vi.mocked(
          prisma.receta.findUnique
        ).mockResolvedValue(null);

        await expect(
          reservarAMedida(
            "usuario-1",
            "inexistente",
            {}
          )
        ).rejects.toMatchObject({
          estado: 404,
        });

        await expect(
          reservarAMedida(
            "usuario-1",
            "inexistente",
            {}
          )
        ).rejects.toThrow(
          "Esta receta no está disponible."
        );

        expect(
          proponerArmado
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-RES-06: rechaza una receta inactiva",
      async () => {
        vi.mocked(
          prisma.receta.findUnique
        ).mockResolvedValue(
          receta({
            activa: false,
          }) as any
        );

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toMatchObject({
          estado: 404,
        });

        expect(
          proponerArmado
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-RES-07: rechaza la reserva cuando la propuesta no puede completar el disfraz",
      async () => {
        vi.mocked(
          proponerArmado
        ).mockResolvedValue(
          propuestaIncompleta() as any
        );

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toMatchObject({
          estado: 409,

          datos: {
            faltantes:
              propuestaIncompleta()
                .faltantes,
          },
        });

        expect(
          prisma.$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-RES-08: incluye los motivos de las piezas faltantes en el mensaje de error",
      async () => {
        vi.mocked(
          proponerArmado
        ).mockResolvedValue(
          propuestaIncompleta() as any
        );

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toThrow(
          "Falta una camisa disponible. Falta un pantalón compatible."
        );
      }
    );

    it(
      "PF-RES-09: crea el disfraz a medida y su reserva dentro de una transacción",
      async () => {
        const tx = ejecutarTransaccionCon(
          txBase()
        );

        const resultado =
          await reservarAMedida(
            "usuario-1",
            "receta-1",
            {
              ropa: "M",
              calzado: "40",
            },
            "Quiero uno para Halloween"
          );

        expect(
          prisma.$transaction
        ).toHaveBeenCalled();

        expect(
          tx.disfrazFisico.create
        ).toHaveBeenCalledTimes(1);

        const disfrazCreado = vi.mocked(
          tx.disfrazFisico.create
        ).mock.calls[0][0] as any;

        expect(
          disfrazCreado.data
        ).toMatchObject({
          tipoDisfraz: "A medida",
          temporadaEvento: "a-medida",
          precioAlquiler: 50,
          origen: "A_MEDIDA",
        });

        expect(
          disfrazCreado.data.nombre
        ).toMatch(
          /^Bombero a medida #[A-F0-9]{4}$/
        );

        expect(resultado.nombre).toBe(
          disfrazCreado.data.nombre
        );
      }
    );

    it(
      "PF-RES-10: guarda usuario, receta, petición y tallas en la reserva",
      async () => {
        const tx = ejecutarTransaccionCon(
          txBase()
        );

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {
            ropa: "L",
            calzado: "42",
          },
          "Petición especial"
        );

        expect(
          tx.reserva.create
        ).toHaveBeenCalledTimes(1);

        const llamada = vi.mocked(
          tx.reserva.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data
        ).toMatchObject({
          tipo: "A_MEDIDA",
          usuarioId: "usuario-1",
          recetaId: "receta-1",
          peticion: "Petición especial",
          tallaRopa: "L",
          tallaCalzado: "42",
        });

        expect(
          llamada.data.vence
        ).toBeInstanceOf(Date);
      }
    );

    it(
      "PF-RES-11: guarda null cuando no se proporcionan petición ni tallas opcionales",
      async () => {
        const tx = ejecutarTransaccionCon(
          txBase()
        );

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {}
        );

        const llamada = vi.mocked(
          tx.reserva.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data.peticion
        ).toBeNull();

        expect(
          llamada.data.tallaRopa
        ).toBeNull();

        expect(
          llamada.data.tallaCalzado
        ).toBeNull();
      }
    );

    it(
      "PF-RES-12: mueve todas las piezas seleccionadas al nuevo disfraz y registra sus movimientos en orden",
      async () => {
        vi.mocked(
          proponerArmado
        ).mockResolvedValue(
          propuestaCompleta({
            piezas: [
              {
                prendaId: "p1",
                origen: "ALMACEN",
                disfrazOrigenId:
                  "almacen-1",
              },

              {
                prendaId: "p2",
                origen: "DISFRAZ",
                disfrazOrigenId:
                  "donante-1",
              },
            ],
          }) as any
        );

        const tx = ejecutarTransaccionCon(
          txBase()
        );

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {}
        );

        expect(
          tx.prenda.updateMany
        ).toHaveBeenCalledTimes(2);

        expect(
          tx.movimientoPrenda.create
        ).toHaveBeenCalledTimes(2);

        const movimiento1 = vi.mocked(
          tx.movimientoPrenda.create
        ).mock.calls[0][0] as any;

        const movimiento2 = vi.mocked(
          tx.movimientoPrenda.create
        ).mock.calls[1][0] as any;

        expect(
          movimiento1.data.orden
        ).toBe(0);

        expect(
          movimiento2.data.orden
        ).toBe(1);

        expect(
          movimiento1.data.prendaId
        ).toBe("p1");

        expect(
          movimiento2.data.prendaId
        ).toBe("p2");
      }
    );

    it(
      "PF-RES-13: verifica que los disfraces donantes no hayan sido alquilados antes de mover sus piezas",
      async () => {
        vi.mocked(
          proponerArmado
        ).mockResolvedValue(
          propuestaCompleta({
            piezas: [
              {
                prendaId: "p1",
                origen: "DISFRAZ",
                disfrazOrigenId:
                  "donante-1",
              },

              {
                prendaId: "p2",
                origen: "DISFRAZ",
                disfrazOrigenId:
                  "donante-1",
              },

              {
                prendaId: "p3",
                origen: "DISFRAZ",
                disfrazOrigenId:
                  "donante-2",
              },
            ],
          }) as any
        );

        const tx = ejecutarTransaccionCon(
          txBase()
        );

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {}
        );

        expect(
          tx.alquilerDisfraz.count
        ).toHaveBeenCalledWith({
          where: {
            disfrazFisicoId: {
              in: [
                "donante-1",
                "donante-2",
              ],
            },

            alquiler: {
              estado: {
                in: [
                  "ACTIVO",
                  "PENDIENTE",
                ],
              },
            },
          },
        });
      }
    );

    it(
      "PF-RES-14: no consulta alquileres de donantes cuando todas las piezas provienen del almacén",
      async () => {
        const tx = ejecutarTransaccionCon(
          txBase()
        );

        await reservarAMedida(
          "usuario-1",
          "receta-1",
          {}
        );

        expect(
          tx.alquilerDisfraz.count
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-RES-15: reintenta el armado cuando un disfraz donante se ocupa concurrentemente",
      async () => {
        vi.mocked(
          proponerArmado
        ).mockResolvedValue(
          propuestaCompleta({
            piezas: [
              {
                prendaId: "p1",
                origen: "DISFRAZ",
                disfrazOrigenId:
                  "donante-1",
              },
            ],
          }) as any
        );

        const tx1 = txBase();
        tx1.alquilerDisfraz.count
          .mockResolvedValue(1);

        const tx2 = txBase();

        vi.mocked(
          prisma.$transaction
        )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx1)
          )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx2)
          );

        const resultado =
          await reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          );

        expect(
          proponerArmado
        ).toHaveBeenCalledTimes(2);

        expect(
          prisma.$transaction
        ).toHaveBeenCalledTimes(2);

        expect(resultado.reservaId).toBe(
          "reserva-1"
        );
      }
    );

    it(
    "PF-RES-16: devuelve conflicto después de agotar los dos intentos por donante ocupado",
    async () => {
        vi.mocked(
        proponerArmado
        ).mockResolvedValue(
        propuestaCompleta({
            piezas: [
            {
                prendaId: "p1",
                origen: "DISFRAZ",
                disfrazOrigenId:
                "donante-1",
            },
            ],
        }) as any
        );

        const tx1 = txBase();
        const tx2 = txBase();

        tx1.alquilerDisfraz.count
        .mockResolvedValue(1);

        tx2.alquilerDisfraz.count
        .mockResolvedValue(1);

        vi.mocked(
        prisma.$transaction
        )
        .mockImplementationOnce(
            async (callback: any) =>
            callback(tx1)
        )
        .mockImplementationOnce(
            async (callback: any) =>
            callback(tx2)
        );

        const promesa = reservarAMedida(
        "usuario-1",
        "receta-1",
        {}
        );

        await expect(promesa).rejects.toMatchObject({
        estado: 409,
        message:
            "Alguien reservó las mismas piezas al mismo tiempo. Intenta de nuevo en unos segundos.",
        });

        expect(
        proponerArmado
        ).toHaveBeenCalledTimes(2);

        expect(
        prisma.$transaction
        ).toHaveBeenCalledTimes(2);
    }
    );
    it(
      "PF-RES-17: reintenta cuando una pieza dejó de estar disponible antes de moverla",
      async () => {
        const tx1 = txBase();

        tx1.prenda.updateMany
          .mockResolvedValue({
            count: 0,
          });

        const tx2 = txBase();

        vi.mocked(
          prisma.$transaction
        )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx1)
          )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx2)
          );

        const resultado =
          await reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          );

        expect(
          proponerArmado
        ).toHaveBeenCalledTimes(2);

        expect(resultado.reservaId).toBe(
          "reserva-1"
        );
      }
    );

    it(
      "PF-RES-18: devuelve conflicto si la pieza cambia de lugar en ambos intentos",
      async () => {
        const tx1 = txBase();
        const tx2 = txBase();

        tx1.prenda.updateMany
          .mockResolvedValue({
            count: 0,
          });

        tx2.prenda.updateMany
          .mockResolvedValue({
            count: 0,
          });

        vi.mocked(
          prisma.$transaction
        )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx1)
          )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx2)
          );

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toThrow(
          "Alguien reservó las mismas piezas al mismo tiempo"
        );
      }
    );

    it(
      "PF-RES-19: reintenta cuando Prisma informa un conflicto concurrente P2034",
      async () => {
        const conflicto =
          new Prisma.PrismaClientKnownRequestError(
            "Transaction conflict",
            {
              code: "P2034",
              clientVersion: "5.22.0",
            }
          );

        const tx = txBase();

        vi.mocked(
          prisma.$transaction
        )
          .mockRejectedValueOnce(
            conflicto
          )
          .mockImplementationOnce(
            async (callback: any) =>
              callback(tx)
          );

        const resultado =
          await reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          );

        expect(
          prisma.$transaction
        ).toHaveBeenCalledTimes(2);

        expect(resultado.reservaId).toBe(
          "reserva-1"
        );
      }
    );

    it(
      "PF-RES-20: propaga errores que no corresponden a conflictos concurrentes",
      async () => {
        vi.mocked(
          prisma.$transaction
        ).mockRejectedValue(
          new Error(
            "Error inesperado de base de datos"
          )
        );

        await expect(
          reservarAMedida(
            "usuario-1",
            "receta-1",
            {}
          )
        ).rejects.toThrow(
          "Error inesperado de base de datos"
        );
      }
    );

    // ========================================================
    // EXTENDER RESERVA
    // ========================================================

    it(
      "PF-RES-21: extiende una reserva activa usando el plazo indicado",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-10-27T15:00:00.000Z"
          )
        );

        vi.mocked(
          prisma.reserva.updateMany
        ).mockResolvedValue({
          count: 1,
        } as any);

        const vence =
          await extenderReserva(
            "reserva-1",
            "usuario-1",
            20
          );

        expect(vence).toEqual(
          new Date(
            "2026-10-27T15:20:00.000Z"
          )
        );

        const llamada = vi.mocked(
          prisma.reserva.updateMany
        ).mock.calls[0][0] as any;

        expect(
          llamada.where
        ).toMatchObject({
          id: "reserva-1",
          usuarioId: "usuario-1",
          liberadaEn: null,
          confirmadaEn: null,
        });

        expect(
          llamada.where.vence.gt
        ).toBeInstanceOf(Date);

        expect(
          llamada.data.vence
        ).toEqual(vence);

        vi.useRealTimers();
      }
    );

    it(
      "PF-RES-22: usa el plazo de pago predeterminado cuando no se indican minutos",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-10-27T15:00:00.000Z"
          )
        );

        const vence =
          await extenderReserva(
            "reserva-1",
            "usuario-1"
          );

        expect(vence).toEqual(
          new Date(
            "2026-10-27T15:30:00.000Z"
          )
        );

        vi.useRealTimers();
      }
    );

    it(
      "PF-RES-23: rechaza extender una reserva que ya no está activa",
      async () => {
        vi.mocked(
          prisma.reserva.updateMany
        ).mockResolvedValue({
          count: 0,
        } as any);

        await expect(
          extenderReserva(
            "reserva-1",
            "usuario-1"
          )
        ).rejects.toMatchObject({
          estado: 409,
        });

        await expect(
          extenderReserva(
            "reserva-1",
            "usuario-1"
          )
        ).rejects.toThrow(
          "La reserva ya no está activa"
        );
      }
    );

    // ========================================================
    // CONFIRMAR RESERVA
    // ========================================================

    it(
      "PF-RES-24: confirma una reserva activa",
      async () => {
        vi.mocked(
          prisma.reserva.updateMany
        ).mockResolvedValue({
          count: 1,
        } as any);

        await expect(
          confirmarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).resolves.toBeUndefined();

        expect(
          prisma.reserva.findFirst
        ).not.toHaveBeenCalled();

        const llamada = vi.mocked(
          prisma.reserva.updateMany
        ).mock.calls[0][0] as any;

        expect(
          llamada.where
        ).toEqual({
          id: "reserva-1",
          usuarioId: "usuario-1",
          liberadaEn: null,
          confirmadaEn: null,
        });

        expect(
          llamada.data.confirmadaEn
        ).toBeInstanceOf(Date);
      }
    );

    it(
      "PF-RES-25: confirmar una reserva ya confirmada es idempotente",
      async () => {
        vi.mocked(
          prisma.reserva.updateMany
        ).mockResolvedValue({
          count: 0,
        } as any);

        vi.mocked(
          prisma.reserva.findFirst
        ).mockResolvedValue({
          id: "reserva-1",
        } as any);

        await expect(
          confirmarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).resolves.toBeUndefined();

        expect(
          prisma.reserva.findFirst
        ).toHaveBeenCalledWith({
          where: {
            id: "reserva-1",
            usuarioId: "usuario-1",

            confirmadaEn: {
              not: null,
            },
          },

          select: {
            id: true,
          },
        });
      }
    );

    it(
      "PF-RES-26: rechaza confirmar una reserva vencida, cancelada o inexistente",
      async () => {
        vi.mocked(
          prisma.reserva.updateMany
        ).mockResolvedValue({
          count: 0,
        } as any);

        vi.mocked(
          prisma.reserva.findFirst
        ).mockResolvedValue(null);

        await expect(
          confirmarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).rejects.toMatchObject({
          estado: 409,
        });

        await expect(
          confirmarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).rejects.toThrow(
          "La reserva ya no está activa: venció o fue cancelada."
        );
      }
    );

    // ========================================================
    // CANCELAR RESERVA
    // ========================================================

    it(
      "PF-RES-27: cancela una reserva sin pagar mediante liberarSinConfirmar",
      async () => {
        vi.mocked(
          liberarSinConfirmar
        ).mockResolvedValue(true as any);

        await expect(
          cancelarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).resolves.toBeUndefined();

        expect(
          liberarSinConfirmar
        ).toHaveBeenCalledWith(
          "reserva-1",
          "usuario-1"
        );
      }
    );

    it(
      "PF-RES-28: rechaza cancelar una reserva inexistente o que ya no está pendiente de pago",
      async () => {
        vi.mocked(
          liberarSinConfirmar
        ).mockResolvedValue(false as any);

        await expect(
          cancelarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).rejects.toMatchObject({
          estado: 404,
        });

        await expect(
          cancelarReserva(
            "reserva-1",
            "usuario-1"
          )
        ).rejects.toThrow(
          "No hay una reserva sin pagar con ese identificador."
        );
      }
    );

    // ========================================================
    // LISTAR RESERVAS
    // ========================================================

    it(
      "PF-RES-29: libera reservas vencidas antes de listar las reservas activas",
      async () => {
        await listarReservasActivas(
          "usuario-1"
        );

        expect(
          liberarReservasVencidas
        ).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "PF-RES-30: consulta únicamente las reservas activas y no confirmadas del usuario",
      async () => {
        await listarReservasActivas(
          "usuario-1"
        );

        expect(
          prisma.reserva.findMany
        ).toHaveBeenCalledWith({
          where: {
            usuarioId: "usuario-1",
            liberadaEn: null,
            confirmadaEn: null,
          },

          include: {
            receta: {
              select: {
                nombre: true,
              },
            },

            disfrazFisico: {
              select: {
                id: true,
                nombre: true,
                precioAlquiler: true,

                prendasActuales: {
                  select: {
                    id: true,
                    nombre: true,
                    tipo: true,
                    color: true,
                    talla: true,
                  },
                },
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
      "PF-RES-31: transforma las reservas activas al formato esperado",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-10-27T15:00:00.000Z"
          )
        );

        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          {
            id: "reserva-1",
            tipo: "A_MEDIDA",

            vence: new Date(
              "2026-10-27T15:05:00.000Z"
            ),

            receta: {
              nombre: "Bombero",
            },

            disfrazFisico: {
              id: "disfraz-1",
              nombre:
                "Bombero a medida #ABCD",
              precioAlquiler: 50,

              prendasActuales: [
                {
                  id: "p1",
                  nombre: "Camisa",
                  tipo: "CAMISA",
                  color: "ROJO",
                  talla: "M",
                },
              ],
            },
          },
        ] as any);

        const resultado =
          await listarReservasActivas(
            "usuario-1"
          );

        expect(resultado).toEqual([
          {
            id: "reserva-1",
            tipo: "A_MEDIDA",

            vence: new Date(
              "2026-10-27T15:05:00.000Z"
            ),

            segundosRestantes: 300,

            receta: "Bombero",

            disfraz: {
              id: "disfraz-1",
              nombre:
                "Bombero a medida #ABCD",
              precioAlquiler: 50,

              prendasActuales: [
                {
                  id: "p1",
                  nombre: "Camisa",
                  tipo: "CAMISA",
                  color: "ROJO",
                  talla: "M",
                },
              ],
            },
          },
        ]);

        vi.useRealTimers();
      }
    );

    it(
      "PF-RES-32: devuelve receta null cuando la reserva no tiene receta asociada",
      async () => {
        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          {
            id: "reserva-1",
            tipo: "A_MEDIDA",
            vence: new Date(
              Date.now() + 60_000
            ),
            receta: null,
            disfrazFisico: {
              id: "d1",
              nombre: "Personalizado",
              precioAlquiler: 50,
              prendasActuales: [],
            },
          },
        ] as any);

        const [resultado] =
          await listarReservasActivas(
            "usuario-1"
          );

        expect(resultado.receta).toBeNull();
      }
    );

    it(
      "PF-RES-33: nunca devuelve segundos restantes negativos",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-10-27T15:00:00.000Z"
          )
        );

        vi.mocked(
          prisma.reserva.findMany
        ).mockResolvedValue([
          {
            id: "reserva-1",
            tipo: "A_MEDIDA",

            vence: new Date(
              "2026-10-27T14:59:00.000Z"
            ),

            receta: {
              nombre: "Bombero",
            },

            disfrazFisico: {
              id: "d1",
              nombre: "Bombero",
              precioAlquiler: 50,
              prendasActuales: [],
            },
          },
        ] as any);

        const [resultado] =
          await listarReservasActivas(
            "usuario-1"
          );

        expect(
          resultado.segundosRestantes
        ).toBe(0);

        vi.useRealTimers();
      }
    );
  }
);