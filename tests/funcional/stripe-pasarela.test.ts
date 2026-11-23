import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  crear: vi.fn(),
  recuperar: vi.fn(),
  reembolsar: vi.fn(),
  listarReembolsos: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { create: stripeMocks.crear, retrieve: stripeMocks.recuperar } };
    refunds = { create: stripeMocks.reembolsar, list: stripeMocks.listarReembolsos };
  },
}));

import { StripePasarela } from "../../src/modules/pagos/stripe.pasarela";
import { ErrorPasarela, YA_REEMBOLSADO } from "../../src/modules/pagos/pasarela-pago";

const pasarela = new StripePasarela("sk_test_falsa");

describe("StripePasarela (adaptador del puerto PasarelaPago)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crearCobro traduce el pedido a una sesión de Checkout de Stripe", async () => {
    stripeMocks.crear.mockResolvedValue({ id: "cs_1", url: "https://checkout.test/x" });

    const resultado = await pasarela.crearCobro({
      lineas: [{ nombre: "Alquiler: Batman", centavos: 10000 }, { nombre: "Garantía", centavos: 2500 }],
      moneda: "pen",
      urlExito: "https://app/pago-exitoso?session_id={ID_SESION}",
      urlCancelacion: "https://app/catalogo",
      descripcionComprobante: "Alquiler",
      usuarioId: "u1",
      metadata: { usuarioId: "u1" },
    });

    expect(resultado).toEqual({ url: "https://checkout.test/x" });
    const parametros = stripeMocks.crear.mock.calls[0][0];
    expect(parametros.mode).toBe("payment");
    expect(parametros.success_url).toBe("https://app/pago-exitoso?session_id={CHECKOUT_SESSION_ID}");
    expect(parametros.line_items[1]).toEqual({
      price_data: { currency: "pen", product_data: { name: "Garantía" }, unit_amount: 2500 },
      quantity: 1,
    });
    expect(parametros.invoice_creation.invoice_data.metadata).toEqual({ usuarioId: "u1" });
    expect(parametros.expires_at).toBeUndefined();
  });

  it("crearCobro fija el vencimiento cuando se pide una vigencia", async () => {
    stripeMocks.crear.mockResolvedValue({ id: "cs_1", url: null });
    const antes = Math.floor(Date.now() / 1000);

    await pasarela.crearCobro({
      lineas: [], moneda: "pen", urlExito: "a", urlCancelacion: "b", descripcionComprobante: "c",
      usuarioId: "u1", metadata: {}, minutosDeVigencia: 31,
    });

    const vence = stripeMocks.crear.mock.calls[0][0].expires_at;
    expect(vence - antes).toBeGreaterThanOrEqual(31 * 60);
    expect(vence - antes).toBeLessThanOrEqual(31 * 60 + 2);
  });

  it("obtenerPago normaliza el estado, el monto y el identificador del cobro", async () => {
    stripeMocks.recuperar.mockResolvedValueOnce({
      id: "cs_1", payment_status: "paid", amount_total: 12500, payment_intent: "pi_1", metadata: { usuarioId: "u1" },
    });
    await expect(pasarela.obtenerPago("cs_1")).resolves.toEqual({
      id: "cs_1", pagado: true, montoTotalCentavos: 12500, idCobro: "pi_1", metadata: { usuarioId: "u1" },
    });

    stripeMocks.recuperar.mockResolvedValueOnce({
      id: "cs_2", payment_status: "unpaid", payment_intent: { id: "pi_2" }, metadata: null,
    });
    await expect(pasarela.obtenerPago("cs_2")).resolves.toEqual({
      id: "cs_2", pagado: false, montoTotalCentavos: null, idCobro: "pi_2", metadata: {},
    });

    stripeMocks.recuperar.mockResolvedValueOnce({ id: "cs_3", payment_status: "unpaid", payment_intent: null });
    await expect(pasarela.obtenerPago("cs_3")).resolves.toMatchObject({ idCobro: null });
  });

  it("obtenerComprobante extrae la factura en PDF o el recibo", async () => {
    stripeMocks.recuperar.mockResolvedValueOnce({
      payment_status: "paid", metadata: { usuarioId: "u1" },
      invoice: { invoice_pdf: "https://x/pdf" },
      payment_intent: { latest_charge: { receipt_url: "https://x/recibo" } },
    });
    await expect(pasarela.obtenerComprobante("cs_1")).resolves.toEqual({
      pagado: true, usuarioId: "u1", facturaPdf: "https://x/pdf", reciboUrl: "https://x/recibo",
    });
    expect(stripeMocks.recuperar).toHaveBeenCalledWith("cs_1", { expand: ["invoice", "payment_intent.latest_charge"] });

    stripeMocks.recuperar.mockResolvedValueOnce({
      payment_status: "unpaid", invoice: "in_123", payment_intent: "pi_1",
    });
    await expect(pasarela.obtenerComprobante("cs_2")).resolves.toEqual({
      pagado: false, usuarioId: undefined, facturaPdf: undefined, reciboUrl: undefined,
    });
  });

  it("reembolsar envía solo lo que se pidió y devuelve el id", async () => {
    stripeMocks.reembolsar.mockResolvedValue({ id: "re_1" });

    await expect(pasarela.reembolsar({ idCobro: "pi_1", claveIdempotencia: "k1" })).resolves.toEqual({ id: "re_1" });
    expect(stripeMocks.reembolsar).toHaveBeenLastCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "k1" });

    await pasarela.reembolsar({
      idCobro: "pi_1", claveIdempotencia: "k2", centavos: 2500, motivo: "solicitado_por_cliente", metadata: { a: "b" },
    });
    expect(stripeMocks.reembolsar).toHaveBeenLastCalledWith(
      { payment_intent: "pi_1", amount: 2500, reason: "requested_by_customer", metadata: { a: "b" } },
      { idempotencyKey: "k2" }
    );
  });

  it("reembolsar envuelve los errores del proveedor en ErrorPasarela conservando su código", async () => {
    stripeMocks.reembolsar.mockRejectedValueOnce({ code: YA_REEMBOLSADO, message: "ya reembolsado" });
    const error = await pasarela.reembolsar({ idCobro: "pi_1", claveIdempotencia: "k" }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorPasarela);
    expect(error.codigo).toBe(YA_REEMBOLSADO);

    stripeMocks.reembolsar.mockRejectedValueOnce({});
    const generico = await pasarela.reembolsar({ idCobro: "pi_1", claveIdempotencia: "k" }).catch((e) => e);
    expect(generico.message).toBe("La pasarela no pudo reembolsar el pago");
  });

  it("buscarReembolso ignora los fallidos o cancelados y los de otra devolución", async () => {
    stripeMocks.listarReembolsos.mockResolvedValue({
      data: [
        { id: "re_fallido", status: "failed", metadata: { devolucionId: "d1" } },
        { id: "re_cancelado", status: "canceled", metadata: { devolucionId: "d1" } },
        { id: "re_otra", status: "succeeded", metadata: { devolucionId: "d2" } },
        { id: "re_ok", status: "succeeded", metadata: { devolucionId: "d1" } },
      ],
    });
    await expect(pasarela.buscarReembolso("pi_1", "d1")).resolves.toBe("re_ok");
    expect(stripeMocks.listarReembolsos).toHaveBeenCalledWith({ payment_intent: "pi_1", limit: 100 });

    stripeMocks.listarReembolsos.mockResolvedValue({ data: [{ id: "x", status: "failed", metadata: { devolucionId: "d1" } }] });
    await expect(pasarela.buscarReembolso("pi_1", "d1")).resolves.toBeNull();
  });
});
