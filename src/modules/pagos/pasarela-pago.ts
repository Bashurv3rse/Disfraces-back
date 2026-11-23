// ============================================================
// PUERTO: lo que el negocio necesita de una pasarela de pagos.
//
// Aquí no aparece nada propio de Stripe (ni sus tipos, ni sus nombres de campos). Los servicios
// de pagos y de garantías dependen de esta interfaz y no del proveedor concreto (principio de
// inversión de dependencias). La única clase que conoce el SDK de Stripe es StripePasarela
// (stripe.pasarela.ts): si mañana se cambia de proveedor, solo se escribe otro adaptador.
// ============================================================

export interface LineaDeCobro {
  nombre: string;
  centavos: number;
}

export interface SolicitudDeCobro {
  lineas: LineaDeCobro[];
  moneda: string;
  // Admite el marcador {ID_SESION}, que la pasarela reemplaza por el identificador del cobro.
  urlExito: string;
  urlCancelacion: string;
  descripcionComprobante: string;
  usuarioId: string;
  metadata: Record<string, string>;
  // Si se indica, el enlace de pago deja de servir pasado ese tiempo.
  minutosDeVigencia?: number;
}

export interface PagoRegistrado {
  id: string;
  pagado: boolean;
  montoTotalCentavos: number | null;
  metadata: Record<string, string>;
  // Identificador del cobro real, necesario para reembolsar. Null si aún no existe.
  idCobro: string | null;
}

export interface Comprobante {
  pagado: boolean;
  usuarioId?: string;
  facturaPdf?: string;
  reciboUrl?: string;
}

export interface SolicitudDeReembolso {
  idCobro: string;
  // Evita reembolsos dobles si la operación se repite.
  claveIdempotencia: string;
  // Sin monto, se reembolsa el pago completo.
  centavos?: number;
  motivo?: "solicitado_por_cliente";
  metadata?: Record<string, string>;
}

export class ErrorPasarela extends Error {
  readonly codigo?: string;
  readonly causa?: unknown;

  constructor(mensaje: string, codigo?: string, causa?: unknown) {
    super(mensaje);
    this.name = "ErrorPasarela";
    this.codigo = codigo;
    this.causa = causa;
  }
}

// Código con el que la pasarela avisa de que el pago ya había sido reembolsado.
export const YA_REEMBOLSADO = "charge_already_refunded";

export interface PasarelaPago {
  crearCobro(solicitud: SolicitudDeCobro): Promise<{ url: string | null }>;
  obtenerPago(idSesion: string): Promise<PagoRegistrado>;
  obtenerComprobante(idSesion: string): Promise<Comprobante>;
  reembolsar(solicitud: SolicitudDeReembolso): Promise<{ id: string }>;
  // Id del reembolso ya hecho para esa devolución (ignorando los fallidos o cancelados), si existe.
  buscarReembolso(idCobro: string, devolucionId: string): Promise<string | null>;
}
