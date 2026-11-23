import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// AISLAMIENTO DEL SERVICIO DE PAGOS
//
// Aquí el SDK de Stripe NO existe: si pagos.service o garantia.service lo importaran
// directamente, la propia importación fallaría. Todo el flujo se ejecuta contra una pasarela
// falsa que cumple el puerto PasarelaPago (Test Double), como pide la rúbrica de la sesión 30.
// ============================================================

vi.mock("stripe", () => {
  throw new Error("Los servicios de negocio no deben importar Stripe directamente");
});

const pasarela = vi.hoisted(() => ({
  crearCobro: vi.fn(),
  obtenerPago: vi.fn(),
  obtenerComprobante: vi.fn(),
  reembolsar: vi.fn(),
  buscarReembolso: vi.fn(),
}));

vi.mock("../../src/modules/pagos/pasarela.config", () => ({
  pasarelaDePago: () => pasarela,
  usarPasarela: vi.fn(),
}));

vi.mock("../../src/config/prisma", () => ({
  prisma: { reserva: { findMany: vi.fn() }, alquiler: { findUnique: vi.fn() } },
}));
vi.mock("../../src/modules/alquileres/alquileres.service", () => ({ crearAlquiler: vi.fn() }));
vi.mock("../../src/modules/disfraces/disfraces.service", () => ({ disfracesNoDisponibles: vi.fn() }));
vi.mock("../../src/modules/pagos/precios.service", () => ({
  cotizar: vi.fn(),
  ErrorCotizacion: class ErrorCotizacion extends Error {
    estado = 400;
  },
}));
vi.mock("../../src/modules/pagos/carrito.service", () => ({
  extenderReservasDelCarrito: vi.fn(),
  prepararCarrito: vi.fn(),
}));
vi.mock("../../src/modules/a-medida/reservas.base", () => ({
  ReservaPerdida: class ReservaPerdida extends Error {},
  liberarSinConfirmar: vi.fn(),
}));
vi.mock("../../src/common/logger", () => ({ registrarEventoSeguridad: vi.fn() }));

import { prisma } from "../../src/config/prisma";
import { crearAlquiler } from "../../src/modules/alquileres/alquileres.service";
import { disfracesNoDisponibles } from "../../src/modules/disfraces/disfraces.service";
import { cotizar } from "../../src/modules/pagos/precios.service";
import { extenderReservasDelCarrito, prepararCarrito } from "../../src/modules/pagos/carrito.service";
import { liberarSinConfirmar } from "../../src/modules/a-medida/reservas.base";
import { ErrorPasarela, YA_REEMBOLSADO } from "../../src/modules/pagos/pasarela-pago";
import { confirmarPago, crearSesionCheckout, obtenerBoleta } from "../../src/modules/pagos/pagos.service";

const datos = { fechaInicio: "2026-11-10", fechaFin: "2026-11-12", evento: "Fiesta", disfraces: ["disfraz-1"] };

const cotizacion = {
  lineas: [{ id: "disfraz-1", nombre: "Batman", precioDia: 50, dias: 2, promocion: null }],
  codigo: null,
  centavos: { lineas: [10000], totalAlquiler: 10000, garantia: 2500, descuento: 0 },
  detalleDescuento: null,
};

function pagoRegistrado(extra: object = {}) {
  return {
    id: "cs_1",
    pagado: true,
    montoTotalCentavos: 12500,
    idCobro: "pi_1",
    metadata: {
      usuarioId: "usuario-1",
      fechaInicio: "2026-11-10",
      fechaFin: "2026-11-12",
      evento: "Fiesta",
      disfraces: JSON.stringify(["disfraz-1"]),
      reservasIds: JSON.stringify(["r1"]),
      montoTotalCent: "10000",
      garantiaCent: "2500",
      descuentoCent: "0",
      detalleDescuento: "",
    },
    ...extra,
  };
}

describe("Servicio de pagos aislado detrás del puerto PasarelaPago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prepararCarrito).mockResolvedValue({ reservas: [] } as any);
    vi.mocked(cotizar).mockResolvedValue(cotizacion as any);
    vi.mocked(disfracesNoDisponibles).mockResolvedValue([]);
    vi.mocked(extenderReservasDelCarrito).mockResolvedValue(undefined as any);
    vi.mocked(prisma.alquiler.findUnique).mockResolvedValue(null);
    vi.mocked(crearAlquiler).mockResolvedValue({ id: "alquiler-1" } as any);
    vi.mocked(liberarSinConfirmar).mockResolvedValue(undefined as any);
    pasarela.crearCobro.mockResolvedValue({ url: "https://pago.test/abc" });
  });

  it("crea el cobro con un pedido en lenguaje de negocio (sin tipos de Stripe)", async () => {
    const resultado = await crearSesionCheckout(datos as any, "usuario-1");

    expect(resultado).toEqual({ url: "https://pago.test/abc" });
    const pedido = pasarela.crearCobro.mock.calls[0][0];
    expect(pedido.moneda).toBe("pen");
    expect(pedido.lineas.map((l: any) => l.centavos)).toEqual([10000, 2500]);
    expect(pedido.lineas[0].nombre).toContain("Batman");
    expect(pedido.lineas[1].nombre).toContain("Garantía");
    expect(pedido.urlExito).toContain("{ID_SESION}");
    expect(pedido.usuarioId).toBe("usuario-1");
    expect(pedido.metadata.montoTotalCent).toBe("10000");
    expect(pedido.minutosDeVigencia).toBeUndefined();
  });

  it("limita la vigencia del cobro solo cuando hay reservas de por medio", async () => {
    vi.mocked(prepararCarrito).mockResolvedValue({ reservas: [{ reservaId: "r1" }] } as any);

    await crearSesionCheckout(datos as any, "usuario-1");

    expect(pasarela.crearCobro.mock.calls[0][0].minutosDeVigencia).toBe(31);
  });

  it("confirma un pago leyendo solo el modelo del puerto y crea el alquiler", async () => {
    pasarela.obtenerPago.mockResolvedValue(pagoRegistrado({ metadata: { ...pagoRegistrado().metadata, reservasIds: "[]" } }));

    const alquiler = await confirmarPago("cs_1", "usuario-1");

    expect(alquiler).toEqual({ id: "alquiler-1" });
    expect(pasarela.obtenerPago).toHaveBeenCalledWith("cs_1");
    expect(vi.mocked(crearAlquiler).mock.calls[0][2]).toMatchObject({ stripeSessionId: "cs_1" });
  });

  it("rechaza pagos sin confirmar, ajenos o con monto distinto al cotizado", async () => {
    pasarela.obtenerPago.mockResolvedValueOnce(pagoRegistrado({ pagado: false }));
    await expect(confirmarPago("cs_1", "usuario-1")).rejects.toThrow("aún no se ha confirmado");

    pasarela.obtenerPago.mockResolvedValueOnce(pagoRegistrado());
    await expect(confirmarPago("cs_1", "otro-usuario")).rejects.toThrow("no corresponde a tu usuario");

    pasarela.obtenerPago.mockResolvedValueOnce(pagoRegistrado({ montoTotalCentavos: 1 }));
    await expect(confirmarPago("cs_1", "usuario-1")).rejects.toThrow("no coincide con la cotización");
  });

  it("reembolsa por la pasarela cuando la reserva se perdió y libera las reservas", async () => {
    pasarela.obtenerPago.mockResolvedValue(pagoRegistrado());
    vi.mocked(prisma.reserva.findMany).mockResolvedValue([] as any); // ninguna reserva sigue viva
    pasarela.reembolsar.mockResolvedValue({ id: "re_1" });

    await expect(confirmarPago("cs_1", "usuario-1")).rejects.toThrow("reembolsado completo");

    expect(pasarela.reembolsar).toHaveBeenCalledWith({
      idCobro: "pi_1",
      claveIdempotencia: "reembolso-reserva-cs_1",
    });
    expect(liberarSinConfirmar).toHaveBeenCalledWith("r1", "usuario-1");
  });

  it("trata «ya reembolsado» como éxito y otros errores de la pasarela como fallo", async () => {
    pasarela.obtenerPago.mockResolvedValue(pagoRegistrado());
    vi.mocked(prisma.reserva.findMany).mockResolvedValue([] as any);

    pasarela.reembolsar.mockRejectedValueOnce(new ErrorPasarela("ya", YA_REEMBOLSADO));
    await expect(confirmarPago("cs_1", "usuario-1")).rejects.toThrow("reembolsado completo");

    const silenciar = vi.spyOn(console, "error").mockImplementation(() => {});
    pasarela.reembolsar.mockRejectedValueOnce(new ErrorPasarela("caída", "api_error"));
    await expect(confirmarPago("cs_1", "usuario-1")).rejects.toThrow("tampoco logramos reembolsar");
    silenciar.mockRestore();
  });

  it("sin identificador de cobro no intenta reembolsar", async () => {
    pasarela.obtenerPago.mockResolvedValue(pagoRegistrado({ idCobro: null }));
    vi.mocked(prisma.reserva.findMany).mockResolvedValue([] as any);

    await expect(confirmarPago("cs_1", "usuario-1")).rejects.toThrow("tampoco logramos reembolsar");

    expect(pasarela.reembolsar).not.toHaveBeenCalled();
  });

  it("la boleta sale del comprobante que entrega la pasarela", async () => {
    pasarela.obtenerComprobante.mockResolvedValue({ pagado: true, usuarioId: "usuario-1", facturaPdf: "https://x/pdf", reciboUrl: "https://x/recibo" });
    await expect(obtenerBoleta("cs_1", "usuario-1")).resolves.toEqual({ tipo: "pdf", url: "https://x/pdf" });

    pasarela.obtenerComprobante.mockResolvedValue({ pagado: true, usuarioId: "usuario-1", reciboUrl: "https://x/recibo" });
    await expect(obtenerBoleta("cs_1", "usuario-1")).resolves.toEqual({ tipo: "recibo", url: "https://x/recibo" });

    pasarela.obtenerComprobante.mockResolvedValue({ pagado: true, usuarioId: "usuario-1" });
    await expect(obtenerBoleta("cs_1", "usuario-1")).rejects.toThrow("todavía no generó la boleta");

    pasarela.obtenerComprobante.mockResolvedValue({ pagado: true, usuarioId: "otro" });
    await expect(obtenerBoleta("cs_1", "usuario-1")).rejects.toThrow("no corresponde a tu usuario");

    pasarela.obtenerComprobante.mockResolvedValue({ pagado: false });
    await expect(obtenerBoleta("cs_1", "usuario-1")).rejects.toThrow("aún no se ha confirmado");
  });
});
