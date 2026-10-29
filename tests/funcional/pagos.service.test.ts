import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// MOCKS
// ============================================================

const stripeMocks = vi.hoisted(() => ({
  crearSesion: vi.fn(),
  recuperarSesion: vi.fn(),
  crearReembolso: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = {
      sessions: {
        create: stripeMocks.crearSesion,
        retrieve: stripeMocks.recuperarSesion,
      },
    };

    refunds = {
      create: stripeMocks.crearReembolso,
    };
  },
}));

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    reserva: {
      findMany: vi.fn(),
    },
    alquiler: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/alquileres/alquileres.service", () => ({
  crearAlquiler: vi.fn(),
}));

vi.mock("../../src/modules/disfraces/disfraces.service", () => ({
  disfracesNoDisponibles: vi.fn(),
}));

vi.mock("../../src/modules/pagos/precios.service", () => ({
  cotizar: vi.fn(),

  ErrorCotizacion: class ErrorCotizacion extends Error {
    estado: number;

    constructor(mensaje: string, estado = 400) {
      super(mensaje);
      this.estado = estado;
    }
  },
}));

vi.mock("../../src/modules/pagos/carrito.service", () => ({
  extenderReservasDelCarrito: vi.fn(),
  prepararCarrito: vi.fn(),
}));

vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  ReservaPerdida: class ReservaPerdida extends Error {
    constructor(mensaje?: string) {
      super(mensaje);
      this.name = "ReservaPerdida";
    }
  },
  liberarSinConfirmar: vi.fn(),
}));

vi.mock("../../src/common/logger", () => ({
  registrarEventoSeguridad: vi.fn(),
}));

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../src/config/prisma";
import { crearAlquiler } from "../../src/modules/alquileres/alquileres.service";
import { disfracesNoDisponibles } from "../../src/modules/disfraces/disfraces.service";
import {
  cotizar,
  ErrorCotizacion,
} from "../../src/modules/pagos/precios.service";
import {
  extenderReservasDelCarrito,
  prepararCarrito,
} from "../../src/modules/pagos/carrito.service";
import {
  ReservaPerdida,
  liberarSinConfirmar,
} from "../../src/modules/a-medida/reservas.base";
import { registrarEventoSeguridad } from "../../src/common/logger";

import {
  crearSesionCheckout,
  confirmarPago,
} from "../../src/modules/pagos/pagos.service";

// ============================================================
// DATOS BASE
// ============================================================

const datosCheckout = {
  fechaInicio: "2026-11-10",
  fechaFin: "2026-11-12",
  evento: "Fiesta",
  disfraces: ["disfraz-1"],
};

const cotizacionBase = {
  lineas: [
    {
      id: "disfraz-1",
      nombre: "Batman",
      precioDia: 50,
      dias: 2,
      promocion: null,
    },
  ],

  codigo: null,

  centavos: {
    lineas: [10000],
    totalAlquiler: 10000,
    garantia: 2500,
    descuento: 0,
  },

  detalleDescuento: null,
};

function sesionPagada(overrides: Record<string, any> = {}) {
  return {
    id: "cs_test_123",
    payment_status: "paid",
    payment_intent: "pi_test_123",
    amount_total: 12500,

    metadata: {
      usuarioId: "usuario-1",
      fechaInicio: "2026-11-10",
      fechaFin: "2026-11-12",
      evento: "Fiesta",
      disfraces: JSON.stringify(["disfraz-1"]),
      reservasIds: JSON.stringify([]),
      montoTotalCent: "10000",
      garantiaCent: "2500",
      descuentoCent: "0",
      detalleDescuento: "",
    },

    ...overrides,
  };
}

describe("PagosService - pruebas unitarias funcionales", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prepararCarrito).mockResolvedValue({
      reservas: [],
    } as any);

    vi.mocked(cotizar).mockResolvedValue(cotizacionBase as any);

    vi.mocked(disfracesNoDisponibles).mockResolvedValue([]);

    vi.mocked(extenderReservasDelCarrito).mockResolvedValue(
      undefined as any
    );

    stripeMocks.crearSesion.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.test/session",
    });

    stripeMocks.crearReembolso.mockResolvedValue({
      id: "re_test_123",
    });

    vi.mocked(prisma.alquiler.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.reserva.findMany).mockResolvedValue([]);

    vi.mocked(crearAlquiler).mockResolvedValue({
      id: "alquiler-1",
      stripeSessionId: "cs_test_123",
    } as any);

    vi.mocked(liberarSinConfirmar).mockResolvedValue(undefined as any);
  });

  // ==========================================================
  // CREAR SESIÓN CHECKOUT
  // ==========================================================

  it("PF-PAGO-01: crea una sesión de Stripe con los importes calculados por el servidor", async () => {
    const resultado = await crearSesionCheckout(
      datosCheckout as any,
      "usuario-1"
    );

    expect(prepararCarrito).toHaveBeenCalledWith(
      ["disfraz-1"],
      "usuario-1"
    );

    expect(cotizar).toHaveBeenCalledWith(datosCheckout);

    expect(disfracesNoDisponibles).toHaveBeenCalledWith(
      ["disfraz-1"],
      "usuario-1"
    );

    expect(stripeMocks.crearSesion).toHaveBeenCalledTimes(1);

    const parametros =
      stripeMocks.crearSesion.mock.calls[0][0];

    expect(parametros.mode).toBe("payment");
    expect(parametros.line_items).toHaveLength(2);

    expect(parametros.line_items[0].price_data.unit_amount).toBe(
      10000
    );

    expect(parametros.line_items[1].price_data.unit_amount).toBe(
      2500
    );

    expect(parametros.metadata.usuarioId).toBe("usuario-1");
    expect(parametros.metadata.montoTotalCent).toBe("10000");
    expect(parametros.metadata.garantiaCent).toBe("2500");

    expect(resultado).toEqual({
      url: "https://checkout.test/session",
    });
  });

  it("PF-PAGO-02: rechaza un código de descuento inválido antes de crear la sesión", async () => {
    vi.mocked(cotizar).mockResolvedValue({
      ...cotizacionBase,
      codigo: {
        valido: false,
        mensaje: "Código promocional inválido",
      },
    } as any);

    await expect(
      crearSesionCheckout(datosCheckout as any, "usuario-1")
    ).rejects.toThrow("Código promocional inválido");

    expect(stripeMocks.crearSesion).not.toHaveBeenCalled();
  });

  it("PF-PAGO-03: rechaza el checkout cuando algún disfraz ya no está disponible", async () => {
    vi.mocked(disfracesNoDisponibles).mockResolvedValue([
      {
        id: "disfraz-1",
        nombre: "Batman",
        estado: "ALQUILADO",
      },
    ] as any);

    await expect(
      crearSesionCheckout(datosCheckout as any, "usuario-1")
    ).rejects.toThrow(
      "«Batman» está alquilado, y no se puede alquilar ahora"
    );

    expect(stripeMocks.crearSesion).not.toHaveBeenCalled();
  });

  it("PF-PAGO-04: usa mensaje genérico cuando el estado del disfraz no está contemplado", async () => {
    vi.mocked(disfracesNoDisponibles).mockResolvedValue([
      {
        id: "disfraz-1",
        nombre: "Batman",
        estado: "OTRO_ESTADO",
      },
    ] as any);

    await expect(
      crearSesionCheckout(datosCheckout as any, "usuario-1")
    ).rejects.toThrow(
      "«Batman» no está disponible"
    );
  });

  it("PF-PAGO-05: incluye la promoción y pluraliza los días en la descripción enviada a Stripe", async () => {
    vi.mocked(cotizar).mockResolvedValue({
      ...cotizacionBase,
      lineas: [
        {
          id: "disfraz-1",
          nombre: "Batman",
          precioDia: 50,
          dias: 2,
          promocion: {
            porcentaje: 20,
          },
        },
      ],
    } as any);

    await crearSesionCheckout(datosCheckout as any, "usuario-1");

    const parametros =
      stripeMocks.crearSesion.mock.calls[0][0];

    const nombre =
      parametros.line_items[0].price_data.product_data.name;

    expect(nombre).toContain("2 días");
    expect(nombre).toContain("20% dto.");
  });

  it("PF-PAGO-06: utiliza singular cuando el alquiler dura un día", async () => {
    vi.mocked(cotizar).mockResolvedValue({
      ...cotizacionBase,
      lineas: [
        {
          id: "disfraz-1",
          nombre: "Batman",
          precioDia: 50,
          dias: 1,
          promocion: null,
        },
      ],
      centavos: {
        ...cotizacionBase.centavos,
        lineas: [5000],
        totalAlquiler: 5000,
        garantia: 1250,
      },
    } as any);

    await crearSesionCheckout(datosCheckout as any, "usuario-1");

    const parametros =
      stripeMocks.crearSesion.mock.calls[0][0];

    const nombre =
      parametros.line_items[0].price_data.product_data.name;

    expect(nombre).toContain("1 día");
    expect(nombre).not.toContain("1 días");
  });

  it("PF-PAGO-07: extiende las reservas antes de crear la sesión de Stripe", async () => {
    const reservas = [
      {
        reservaId: "reserva-1",
      },
    ];

    vi.mocked(prepararCarrito).mockResolvedValue({
      reservas,
    } as any);

    await crearSesionCheckout(datosCheckout as any, "usuario-1");

    expect(extenderReservasDelCarrito).toHaveBeenCalledWith(
      reservas,
      "usuario-1"
    );
  });

  it("PF-PAGO-08: agrega expires_at cuando el carrito contiene reservas", async () => {
    vi.mocked(prepararCarrito).mockResolvedValue({
      reservas: [
        {
          reservaId: "reserva-1",
        },
      ],
    } as any);

    const ahora = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(ahora);

    await crearSesionCheckout(datosCheckout as any, "usuario-1");

    const parametros =
      stripeMocks.crearSesion.mock.calls[0][0];

    expect(parametros.expires_at).toBe(
      Math.floor(ahora / 1000) + 31 * 60
    );

    vi.restoreAllMocks();
  });

  it("PF-PAGO-09: no agrega expires_at cuando no existen reservas", async () => {
    await crearSesionCheckout(datosCheckout as any, "usuario-1");

    const parametros =
      stripeMocks.crearSesion.mock.calls[0][0];

    expect(parametros.expires_at).toBeUndefined();
  });

  // ==========================================================
  // CONFIRMAR PAGO
  // ==========================================================

  it("PF-PAGO-10: rechaza una sesión cuyo pago todavía no fue confirmado", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada({
        payment_status: "unpaid",
      })
    );

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "El pago aún no se ha confirmado con Stripe"
    );

    expect(crearAlquiler).not.toHaveBeenCalled();
  });

  it("PF-PAGO-11: rechaza una sesión que pertenece a otro usuario", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada({
        metadata: {
          ...sesionPagada().metadata,
          usuarioId: "otro-usuario",
        },
      })
    );

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "Esta sesión de pago no corresponde a tu usuario"
    );

    expect(crearAlquiler).not.toHaveBeenCalled();
  });

  it("PF-PAGO-12: devuelve el alquiler existente y evita duplicarlo", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada()
    );

    const alquilerExistente = {
      id: "alquiler-existente",
      stripeSessionId: "cs_test_123",
    };

    vi.mocked(prisma.alquiler.findUnique).mockResolvedValue(
      alquilerExistente as any
    );

    const resultado = await confirmarPago(
      "cs_test_123",
      "usuario-1"
    );

    expect(resultado).toEqual(alquilerExistente);
    expect(crearAlquiler).not.toHaveBeenCalled();
  });

  it("PF-PAGO-13: rechaza el pago cuando el monto cobrado por Stripe no coincide con la cotización", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada({
        amount_total: 9999,
      })
    );

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "El monto cobrado no coincide con la cotización"
    );

    expect(crearAlquiler).not.toHaveBeenCalled();
  });

  it("PF-PAGO-14: crea el alquiler usando los precios almacenados en la sesión de Stripe", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada()
    );

    await confirmarPago("cs_test_123", "usuario-1");

    expect(crearAlquiler).toHaveBeenCalledWith(
      {
        fechaInicio: "2026-11-10",
        fechaFin: "2026-11-12",
        evento: "Fiesta",
        disfraces: ["disfraz-1"],
      },
      "usuario-1",
      {
        stripeSessionId: "cs_test_123",

        precios: {
          montoTotal: 100,
          montoGarantia: 25,
          descuento: 0,
          detalleDescuento: null,
        },

        reservasIds: [],
      }
    );
  });

  it("PF-PAGO-15: permite confirmar sesiones antiguas sin metadatos de precios", async () => {
    const session = sesionPagada();

    session.metadata = {
      usuarioId: "usuario-1",
      fechaInicio: "2026-11-10",
      fechaFin: "2026-11-12",
      evento: "",
      disfraces: JSON.stringify(["disfraz-1"]),
      reservasIds: JSON.stringify([]),
    } as any;

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    await confirmarPago("cs_test_123", "usuario-1");

    expect(crearAlquiler).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: undefined,
      }),
      "usuario-1",
      {
        stripeSessionId: "cs_test_123",
        precios: undefined,
        reservasIds: [],
      }
    );
  });

  it("PF-PAGO-16: convierte el descuento y detalle guardados en metadata", async () => {
    const session = sesionPagada();

    session.metadata.descuentoCent = "1500";
    session.metadata.detalleDescuento = "Promoción 15%";

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    await confirmarPago("cs_test_123", "usuario-1");

    expect(crearAlquiler).toHaveBeenCalledWith(
      expect.anything(),
      "usuario-1",
      expect.objectContaining({
        precios: expect.objectContaining({
          descuento: 15,
          detalleDescuento: "Promoción 15%",
        }),
      })
    );
  });

  // ==========================================================
  // RESERVA PERDIDA / REEMBOLSO
  // ==========================================================

  it("PF-PAGO-17: reembolsa el pago cuando una reserva ya fue liberada", async () => {
    const session = sesionPagada();

    session.metadata.reservasIds = JSON.stringify([
      "reserva-1",
      "reserva-2",
    ]);

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    // Solo una de las dos sigue activa.
    vi.mocked(prisma.reserva.findMany).mockResolvedValue([
      {
        id: "reserva-1",
      },
    ] as any);

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "Tu pago fue reembolsado completo"
    );

    expect(stripeMocks.crearReembolso).toHaveBeenCalledWith(
      {
        payment_intent: "pi_test_123",
      },
      {
        idempotencyKey:
          "reembolso-reserva-cs_test_123",
      }
    );

    expect(liberarSinConfirmar).toHaveBeenCalledTimes(2);

    expect(registrarEventoSeguridad).toHaveBeenCalledWith({
      evento: "PAGO_REEMBOLSADO_RESERVA_PERDIDA",
      usuarioId: "usuario-1",
      detalle: "cs_test_123",
    });

    expect(crearAlquiler).not.toHaveBeenCalled();
  });

  it("PF-PAGO-18: considera exitoso el reembolso si Stripe indica que ya había sido reembolsado", async () => {
    const session = sesionPagada();

    session.metadata.reservasIds = JSON.stringify([
      "reserva-1",
    ]);

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([]);

    stripeMocks.crearReembolso.mockRejectedValue({
      code: "charge_already_refunded",
    });

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "Tu pago fue reembolsado completo"
    );

    expect(registrarEventoSeguridad).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "PAGO_REEMBOLSADO_RESERVA_PERDIDA",
      })
    );
  });

  it("PF-PAGO-19: informa un fallo crítico cuando Stripe no puede reembolsar automáticamente", async () => {
    const session = sesionPagada();

    session.metadata.reservasIds = JSON.stringify([
      "reserva-1",
    ]);

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([]);

    stripeMocks.crearReembolso.mockRejectedValue({
      code: "stripe_error",
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "No pudimos completar tu alquiler y tampoco logramos reembolsar"
    );

    expect(registrarEventoSeguridad).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "PAGO_REEMBOLSO_FALLIDO",
      })
    );

    consoleError.mockRestore();
  });

  it("PF-PAGO-20: informa fallo de reembolso cuando Stripe no proporciona payment_intent", async () => {
    const session = sesionPagada({
      payment_intent: null,
    });

    session.metadata.reservasIds = JSON.stringify([
      "reserva-1",
    ]);

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([]);

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "No pudimos completar tu alquiler y tampoco logramos reembolsar"
    );

    expect(stripeMocks.crearReembolso).not.toHaveBeenCalled();

    expect(registrarEventoSeguridad).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "PAGO_REEMBOLSO_FALLIDO",
      })
    );
  });

  // ==========================================================
  // CONDICIONES DE CARRERA / IDEMPOTENCIA
  // ==========================================================

  it("PF-PAGO-21: recupera el alquiler creado por otra petición cuando Prisma devuelve P2002 por stripeSessionId", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada()
    );

    vi.mocked(crearAlquiler).mockRejectedValue({
      code: "P2002",
      meta: {
        target: ["stripeSessionId"],
      },
    });

    const yaCreado = {
      id: "alquiler-creado-en-paralelo",
      stripeSessionId: "cs_test_123",
    };

    vi.mocked(prisma.alquiler.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(yaCreado as any);

    const resultado = await confirmarPago(
      "cs_test_123",
      "usuario-1"
    );

    expect(resultado).toEqual(yaCreado);
  });

  it("PF-PAGO-22: relanza el error P2002 cuando no encuentra el alquiler creado en paralelo", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada()
    );

    const error = {
      code: "P2002",
      meta: {
        target: ["stripeSessionId"],
      },
    };

    vi.mocked(crearAlquiler).mockRejectedValue(error);

    vi.mocked(prisma.alquiler.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toBe(error);
  });

  it("PF-PAGO-23: reembolsa cuando la reserva se pierde durante la creación del alquiler", async () => {
    const session = sesionPagada();

    session.metadata.reservasIds = JSON.stringify([
      "reserva-1",
    ]);

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    // La reserva existe durante la comprobación inicial.
    vi.mocked(prisma.reserva.findMany).mockResolvedValue([
      {
        id: "reserva-1",
      },
    ] as any);

    vi.mocked(crearAlquiler).mockRejectedValue(
    new ReservaPerdida()
    );

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "Tu pago fue reembolsado completo"
    );

    expect(stripeMocks.crearReembolso).toHaveBeenCalled();
  });

  it("PF-PAGO-24: reembolsa cuando crearAlquiler detecta ErrorCotizacion 404 con reservas", async () => {
    const session = sesionPagada();

    session.metadata.reservasIds = JSON.stringify([
      "reserva-1",
    ]);

    stripeMocks.recuperarSesion.mockResolvedValue(session);

    vi.mocked(prisma.reserva.findMany).mockResolvedValue([
      {
        id: "reserva-1",
      },
    ] as any);

    vi.mocked(crearAlquiler).mockRejectedValue(
      new ErrorCotizacion(
        "El disfraz reservado ya no existe",
        404
      )
    );

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toThrow(
      "Tu pago fue reembolsado completo"
    );

    expect(stripeMocks.crearReembolso).toHaveBeenCalled();
  });

  it("PF-PAGO-25: relanza errores normales ocurridos durante la creación del alquiler", async () => {
    stripeMocks.recuperarSesion.mockResolvedValue(
      sesionPagada()
    );

    const error = new Error("Error inesperado");

    vi.mocked(crearAlquiler).mockRejectedValue(error);

    await expect(
      confirmarPago("cs_test_123", "usuario-1")
    ).rejects.toBe(error);

    expect(stripeMocks.crearReembolso).not.toHaveBeenCalled();
  });
});