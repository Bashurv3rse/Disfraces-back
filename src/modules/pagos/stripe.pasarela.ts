import Stripe from "stripe";
import { ErrorPasarela } from "./pasarela-pago";
import type {
  Comprobante,
  PagoRegistrado,
  PasarelaPago,
  SolicitudDeCobro,
  SolicitudDeReembolso,
} from "./pasarela-pago";

// ADAPTADOR de Stripe: traduce el lenguaje del negocio (PasarelaPago) al SDK de Stripe.
// Es el único archivo del backend que importa "stripe".
export class StripePasarela implements PasarelaPago {
  private readonly stripe: Stripe;

  constructor(claveSecreta: string) {
    this.stripe = new Stripe(claveSecreta);
  }

  async crearCobro(solicitud: SolicitudDeCobro): Promise<{ url: string | null }> {
    const lineas: Stripe.Checkout.SessionCreateParams.LineItem[] = solicitud.lineas.map((l) => ({
      price_data: {
        currency: solicitud.moneda,
        product_data: { name: l.nombre },
        unit_amount: l.centavos,
      },
      quantity: 1,
    }));

    const parametros: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineas,
      success_url: solicitud.urlExito.replace("{ID_SESION}", "{CHECKOUT_SESSION_ID}"),
      cancel_url: solicitud.urlCancelacion,
      // Stripe genera, al pagar, una factura con su PDF: es la base de la boleta que descarga el cliente.
      invoice_creation: {
        enabled: true,
        invoice_data: { description: solicitud.descripcionComprobante, metadata: { usuarioId: solicitud.usuarioId } },
      },
      metadata: solicitud.metadata,
    };
    if (solicitud.minutosDeVigencia !== undefined) {
      parametros.expires_at = Math.floor(Date.now() / 1000) + solicitud.minutosDeVigencia * 60;
    }

    const session = await this.stripe.checkout.sessions.create(parametros);
    return { url: session.url };
  }

  async obtenerPago(idSesion: string): Promise<PagoRegistrado> {
    const session = await this.stripe.checkout.sessions.retrieve(idSesion);
    const intento = session.payment_intent;
    return {
      id: session.id,
      pagado: session.payment_status === "paid",
      montoTotalCentavos: session.amount_total ?? null,
      metadata: (session.metadata ?? {}) as Record<string, string>,
      idCobro: typeof intento === "string" ? intento : (intento?.id ?? null),
    };
  }

  async obtenerComprobante(idSesion: string): Promise<Comprobante> {
    const session = await this.stripe.checkout.sessions.retrieve(idSesion, {
      expand: ["invoice", "payment_intent.latest_charge"],
    });

    const factura = session.invoice && typeof session.invoice !== "string" ? session.invoice : null;
    const intento = session.payment_intent && typeof session.payment_intent !== "string" ? session.payment_intent : null;
    const cargo = intento?.latest_charge && typeof intento.latest_charge !== "string" ? intento.latest_charge : null;

    return {
      pagado: session.payment_status === "paid",
      usuarioId: session.metadata?.usuarioId,
      facturaPdf: factura?.invoice_pdf ?? undefined,
      reciboUrl: cargo?.receipt_url ?? undefined,
    };
  }

  async reembolsar(solicitud: SolicitudDeReembolso): Promise<{ id: string }> {
    const parametros: Stripe.RefundCreateParams = { payment_intent: solicitud.idCobro };
    if (solicitud.centavos !== undefined) parametros.amount = solicitud.centavos;
    if (solicitud.motivo === "solicitado_por_cliente") parametros.reason = "requested_by_customer";
    if (solicitud.metadata) parametros.metadata = solicitud.metadata;

    try {
      const reembolso = await this.stripe.refunds.create(parametros, { idempotencyKey: solicitud.claveIdempotencia });
      return { id: reembolso.id };
    } catch (error: any) {
      throw new ErrorPasarela(error?.message ?? "La pasarela no pudo reembolsar el pago", error?.code, error);
    }
  }

  async buscarReembolso(idCobro: string, devolucionId: string): Promise<string | null> {
    const previos = await this.stripe.refunds.list({ payment_intent: idCobro, limit: 100 });
    const existente = previos.data.find(
      (r) => r.metadata?.devolucionId === devolucionId && r.status !== "failed" && r.status !== "canceled"
    );
    return existente?.id ?? null;
  }
}
