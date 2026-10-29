import type { Cotizacion } from "../../../src/modules/pagos/precios.service";
import type { buscarRecetas } from "../../../src/modules/a-medida/busqueda.service";

// Contratos usados por los fixtures de integración. El JSON no se transforma:
// las aserciones siguen comprobando el contenido original, incluidos campos extra.
export async function leerJson<T>(respuesta: { json(): Promise<unknown> }): Promise<T> {
  return await respuesta.json() as T;
}
export interface MensajeHTTP { mensaje: string }
export interface ErroresHTTP { errores: Record<string, string[]> }
export interface UsuarioHTTP { id: string; email: string; rol: string }
export interface SesionHTTP { usuario: UsuarioHTTP; accessToken: string }
export interface PerfilHTTP { usuario: UsuarioHTTP }
export interface TokenHTTP { accessToken: string }
export interface IdHTTP { id: string }
export interface DisfrazHTTP extends IdHTTP { nombre: string; estado: string; completo: boolean; prendasHogar: IdHTTP[] }
export interface DevolucionHTTP extends IdHTTP { garantiaEstado: string }
export interface DevolucionCreadaHTTP { devolucion: DevolucionHTTP; sustituciones: unknown[] }
export interface ReservaHTTP { reservaId: string; disfrazId: string; nombre: string; vence: string; segundosRestantes: number }
export type ReservasHTTP = Pick<ReservaHTTP, "reservaId">[];
export type BusquedaHTTP = Awaited<ReturnType<typeof buscarRecetas>>;
export interface PropuestaHTTP { completo: boolean; cambios: number; piezas: { nombre: string; tipo: string; talla: string }[]; faltantes: { tipo: string }[] }
export type CotizacionHTTP = Omit<Cotizacion, "centavos"> & { reservas: unknown[] };
export interface ResumenHTTP {
  totalAlquileres: number; alquileresActivos: number; alquileresProximos: number;
  ingresosMes: number; devolucionesPendientes: number;
  alertasStock: { nombre: string; detalle: string }[];
}
export interface ProveedorHTTP extends IdHTTP { prendas: { prenda: { id: string; nombre: string; talla: string; color: string } }[] }
export interface RecetaHTTP extends IdHTTP { peticionesVinculadas: number }
export interface DemandaHTTP {
  grupos: { textoNormalizado: string; veces: number; personas: number }[];
  resumen: { pedidosPendientes: number; atendidosSinReceta: number };
}
export interface AlmacenHTTP { grupos: { nombre: string; tipo: string; color: string; totalDisponibles: number; tallas: { talla: string; total: number; disponibles: number }[] }[] }
export type EnCursoHTTP = { reservaId: string }[];
export interface AlquilerConGarantiaHTTP extends IdHTTP {
  devolucion: { garantiaEstado: string; garantiaMotivo: string | null; garantiaMonto: string | number | null; garantiaReembolsoId: string | null; garantiaResueltaEn: string | null; prendas: unknown[] };
}
