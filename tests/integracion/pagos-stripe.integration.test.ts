import {
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "../../src/config/prisma";

const retrieveMock = vi.fn();

vi.mock("stripe", () => {
  return {
    default: class StripeMock {
      checkout = {
        sessions: {
          retrieve: retrieveMock,
          create: vi.fn(),
        },
      };

      refunds = {
        create: vi.fn(),
      };
    },
  };
});

describe("Pruebas de integración - pagos con Stripe", () => {
    afterAll(async () => {
        await limpiarPagoValido();
        await prisma.$disconnect();
    });
    beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    await limpiarPagoValido();
    });

    const emailPago = "integracion-pago@test.local";

    async function limpiarPagoValido() {
    const usuario = await prisma.usuario.findUnique({
        where: {
        email: emailPago,
        },
    });

    if (usuario) {
        const alquileres = await prisma.alquiler.findMany({
        where: {
            usuarioId: usuario.id,
        },
        select: {
            id: true,
        },
        });

        const alquilerIds = alquileres.map((a) => a.id);

        if (alquilerIds.length > 0) {
        await prisma.alquilerDisfraz.deleteMany({
            where: {
            alquilerId: {
                in: alquilerIds,
            },
            },
        });

        await prisma.alquiler.deleteMany({
            where: {
            id: {
                in: alquilerIds,
            },
            },
        });
        }

        await prisma.sesionActiva.deleteMany({
        where: {
            usuarioId: usuario.id,
        },
        });

        await prisma.usuario.delete({
        where: {
            id: usuario.id,
        },
        });
    }

    const disfraces = await prisma.disfrazFisico.findMany({
        where: {
        nombre: {
            startsWith: "TEST-PAGO-",
        },
        },
        select: {
        id: true,
        },
    });

    const disfrazIds = disfraces.map((d) => d.id);

    if (disfrazIds.length > 0) {
        await prisma.prenda.deleteMany({
        where: {
            OR: [
            {
                disfrazHogarId: {
                in: disfrazIds,
                },
            },
            {
                disfrazActualId: {
                in: disfrazIds,
                },
            },
            ],
        },
        });

        await prisma.disfrazFisico.deleteMany({
        where: {
            id: {
            in: disfrazIds,
            },
        },
        });
    }
    }

    async function prepararPagoValido() {
    const usuario = await prisma.usuario.create({
        data: {
        nombre: "Usuario Pago",
        email: emailPago,
        password: "hash-prueba",
        telefono: "987654321",
        direccion: "Dirección prueba",
        rol: "CLIENTE",
        },
    });

    const disfraz = await prisma.disfrazFisico.create({
        data: {
        nombre: "TEST-PAGO-DISFRAZ",
        tipoDisfraz: "TRADICIONAL",
        temporadaEvento: "PRUEBA",
        precioAlquiler: 40,
        },
    });

    await prisma.prenda.create({
        data: {
        nombre: "TEST-PAGO-CAMISA",
        tipo: "CAMISA",
        color: "Negro",
        talla: "M",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
        },
    });

    return {
        usuario,
        disfraz,
    };
    }
  it("TC-BE-PAG-03: rechaza una sesión de Stripe cuyo pago todavía no está confirmado", async () => {
    retrieveMock.mockResolvedValue({
      id: "cs_test_pi12",
      payment_status: "unpaid",
      metadata: {
        usuarioId: "usuario-prueba",
      },
    });

    const { confirmarPago } =
      await import("../../src/modules/pagos/pagos.service");

    await expect(
      confirmarPago(
        "cs_test_pi12",
        "usuario-prueba"
      )
    ).rejects.toThrow(
      "El pago aún no se ha confirmado con Stripe"
    );

    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(retrieveMock).toHaveBeenCalledWith(
      "cs_test_pi12"
    );
  });

  it("TC-BE-PAG-05: rechaza una sesión de Stripe que pertenece a otro usuario", async () => {
    retrieveMock.mockResolvedValue({
      id: "cs_test_pi13",
      payment_status: "paid",
      metadata: {
        usuarioId: "otro-usuario",
      },
    });

    const { confirmarPago } =
      await import("../../src/modules/pagos/pagos.service");

    await expect(
      confirmarPago(
        "cs_test_pi13",
        "usuario-autenticado"
      )
    ).rejects.toThrow(
      "Esta sesión de pago no corresponde a tu usuario"
    );

    expect(retrieveMock).toHaveBeenCalledTimes(1);
  });

  it("PI-14: rechaza el pago cuando el monto cobrado por Stripe no coincide con la cotización", async () => {
    retrieveMock.mockResolvedValue({
      id: "cs_test_pi14",
      payment_status: "paid",

      amount_total: 15000,

      metadata: {
        usuarioId: "usuario-prueba",

        fechaInicio: "2026-10-25",
        fechaFin: "2026-10-27",

        disfraces: JSON.stringify([]),
        reservasIds: JSON.stringify([]),

        montoTotalCent: "10000",
        garantiaCent: "2500",
        descuentoCent: "0",
        detalleDescuento: "",
      },
    });

    const { confirmarPago } =
      await import("../../src/modules/pagos/pagos.service");

    await expect(
      confirmarPago(
        "cs_test_pi14",
        "usuario-prueba"
      )
    ).rejects.toThrow(
      "El monto cobrado no coincide con la cotización de esta reserva. Contacta a la tienda."
    );

    expect(retrieveMock).toHaveBeenCalledTimes(1);
  });

    it("TC-BE-PAG-02: un pago válido confirmado por Stripe crea el alquiler en PostgreSQL", async () => {
    const {
        usuario,
        disfraz,
    } = await prepararPagoValido();

    const sessionId = "cs_test_pi15";

    retrieveMock.mockResolvedValue({
        id: sessionId,
        payment_status: "paid",
        amount_total: 10000,

        metadata: {
        usuarioId: usuario.id,

        fechaInicio: "2026-10-25",
        fechaFin: "2026-10-26",

        evento: "",
        disfraces: JSON.stringify([
            disfraz.id,
        ]),

        reservasIds: JSON.stringify([]),

        montoTotalCent: "8000",
        garantiaCent: "2000",
        descuentoCent: "0",
        detalleDescuento: "",
        },
    });

    const { confirmarPago } =
        await import("../../src/modules/pagos/pagos.service");

    const resultado = await confirmarPago(
        sessionId,
        usuario.id
    );

    expect(resultado).toBeDefined();
    expect(resultado.stripeSessionId).toBe(
        sessionId
    );

    expect(Number(resultado.montoTotal)).toBe(80);
    expect(Number(resultado.montoGarantia)).toBe(20);

    const alquilerGuardado =
        await prisma.alquiler.findUnique({
        where: {
            stripeSessionId: sessionId,
        },
        include: {
            disfraces: true,
        },
        });

    expect(alquilerGuardado).not.toBeNull();

    expect(alquilerGuardado?.usuarioId).toBe(
        usuario.id
    );

    expect(alquilerGuardado?.estado).toBe(
        "ACTIVO"
    );

    expect(Number(alquilerGuardado?.montoTotal)).toBe(
        80
    );

    expect(
        Number(alquilerGuardado?.montoGarantia)
    ).toBe(20);

    expect(alquilerGuardado?.disfraces).toHaveLength(
        1
    );

    expect(
        alquilerGuardado?.disfraces[0].disfrazFisicoId
    ).toBe(disfraz.id);
    });
    it("TC-BE-PAG-04: confirmar dos veces la misma sesión de Stripe no duplica el alquiler", async () => {
    const {
        usuario,
        disfraz,
    } = await prepararPagoValido();

    const sessionId = "cs_test_pi16";

    retrieveMock.mockResolvedValue({
        id: sessionId,
        payment_status: "paid",
        amount_total: 10000,

        metadata: {
        usuarioId: usuario.id,

        fechaInicio: "2026-10-25",
        fechaFin: "2026-10-26",

        evento: "",
        disfraces: JSON.stringify([
            disfraz.id,
        ]),

        reservasIds: JSON.stringify([]),

        montoTotalCent: "8000",
        garantiaCent: "2000",
        descuentoCent: "0",
        detalleDescuento: "",
        },
    });

    const { confirmarPago } =
        await import("../../src/modules/pagos/pagos.service");

    const primeraConfirmacion =
        await confirmarPago(
        sessionId,
        usuario.id
        );

    const segundaConfirmacion =
        await confirmarPago(
        sessionId,
        usuario.id
        );

    expect(segundaConfirmacion.id).toBe(
        primeraConfirmacion.id
    );

    const cantidad =
        await prisma.alquiler.count({
        where: {
            stripeSessionId: sessionId,
        },
        });

    expect(cantidad).toBe(1);

    expect(retrieveMock).toHaveBeenCalledTimes(2);
    });
});