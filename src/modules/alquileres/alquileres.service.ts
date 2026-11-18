import { prisma } from "../../config/prisma";
import { CrearAlquilerInput } from "./alquileres.schema";
import { cotizar } from "../pagos/precios.service";
import { ReservaPerdida } from "../a-medida/reservas.base";

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NOMBRE_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export interface PreciosAlquiler {
  montoTotal: number; // total del alquiler YA con el descuento aplicado
  montoGarantia: number; // 25% de montoTotal
  descuento: number;
  detalleDescuento: string | null;
}

// Si se pasan `precios` (flujo de pago), se guardan tal cual: son los que el cliente pagó.
// Si no (alquiler creado por un administrador), se calculan con las ofertas automáticas.
// Si se pasan `precios` (flujo de pago), se guardan tal cual: son los que el cliente pagó.
// Si no (alquiler creado por un administrador), se calculan con las ofertas automáticas.
// `reservasIds`: reservas de disfraces a medida que se confirman en la MISMA transacción que
// crea el alquiler. Si alguna ya no está activa, no se crea nada y se lanza ReservaPerdida.
export async function crearAlquiler(
  datos: CrearAlquilerInput,
  usuarioId: string,
  opciones: { stripeSessionId?: string; precios?: PreciosAlquiler; reservasIds?: string[] } = {}
) {
  const cotizacion = await cotizar({
    disfraces: datos.disfraces,
    fechaInicio: datos.fechaInicio,
    fechaFin: datos.fechaFin,
  });

  const precios: PreciosAlquiler = opciones.precios ?? {
    montoTotal: cotizacion.totalAlquiler,
    montoGarantia: cotizacion.garantia,
    descuento: cotizacion.descuento,
    detalleDescuento: cotizacion.detalleDescuento,
  };

  return prisma.$transaction(async (tx) => {
    for (const reservaId of opciones.reservasIds ?? []) {
      const confirmada = await tx.reserva.updateMany({
        where: { id: reservaId, usuarioId, liberadaEn: null, confirmadaEn: null },
        data: { confirmadaEn: new Date() },
      });
      if (confirmada.count === 0) {
        // Puede estar ya confirmada (un reintento tras un fallo): eso sí es válido.
        const yaConfirmada = await tx.reserva.findFirst({
          where: { id: reservaId, usuarioId, liberadaEn: null, confirmadaEn: { not: null } },
          select: { id: true },
        });
        if (!yaConfirmada) throw new ReservaPerdida();
      }
    }

    return tx.alquiler.create({
      data: {
        usuarioId,
        fechaInicio: new Date(datos.fechaInicio),
        fechaFin: new Date(datos.fechaFin),
        evento: datos.evento,
        estado: "ACTIVO",
        montoTotal: precios.montoTotal,
        montoGarantia: precios.montoGarantia,
        descuento: precios.descuento,
        detalleDescuento: precios.detalleDescuento,
        stripeSessionId: opciones.stripeSessionId,
        disfraces: {
          // precioUnitario sigue siendo el precio POR DÍA de lista; el descuento va a nivel de alquiler.
          create: cotizacion.lineas.map((l) => ({ disfrazFisicoId: l.disfrazId, precioUnitario: l.precioDia })),
        },
      },
      include: { disfraces: { include: { disfrazFisico: true } } },
    });
  });
}

export function listarPropios(usuarioId: string) {
  return prisma.alquiler.findMany({
    where: { usuarioId },
    include: {
      disfraces: { include: { disfrazFisico: { include: { prendasActuales: true } } } },
      // Comprobante de la garantía: lo que el cliente puede ver de la revisión de la tienda.
      devolucion: {
        select: {
          fechaDevolucion: true,
          garantiaEstado: true,
          garantiaMonto: true,
          garantiaMotivo: true,
          garantiaReembolsoId: true,
          garantiaResueltaEn: true,
          prendas: {
            select: {
              estadoPrenda: true,
              estadoAdmin: true,
              observacion: true,
              prenda: { select: { id: true, nombre: true, color: true, talla: true } },
            },
          },
        },
      },
    },
    orderBy: { creadoEn: "desc" },
  });
}

export function listarTodos() {
  return prisma.alquiler.findMany({
    include: { disfraces: { include: { disfrazFisico: true } }, usuario: { select: { nombre: true, email: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

// --- Historial completo de alquileres (administrador) ---

export type EstadoVisible = "PENDIENTE" | "PROXIMO" | "EN_CURSO" | "POR_DEVOLVER" | "FINALIZADO" | "CANCELADO";

// Estado que entiende el administrador: combina el estado guardado con las fechas.
export function estadoVisibleDeAlquiler(
  a: { estado: string; fechaInicio: Date; fechaFin: Date },
  ahora: Date = new Date()
): EstadoVisible {
  if (a.estado === "CANCELADO") return "CANCELADO";
  if (a.estado === "FINALIZADO") return "FINALIZADO";
  if (a.estado === "PENDIENTE") return "PENDIENTE";
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  if (a.fechaInicio.getTime() > hoy) return "PROXIMO";
  if (a.fechaFin.getTime() < hoy) return "POR_DEVOLVER";
  return "EN_CURSO";
}

// Talla de ropa o de calzado del disfraz (la más repetida entre sus prendas); null si no tiene.
export function tallaPrincipal(prendas: { tipo: string; talla: string }[] | undefined, categoria: "ROPA" | "CALZADO"): string | null {
  const esCalzado = (t: string) => t === "ZAPATO" || t === "TACON";
  const esUnica = (t: string) => t === "PANUELO" || t === "ACCESORIO";
  const tallas = (prendas ?? [])
    .filter((p) => (categoria === "CALZADO" ? esCalzado(p.tipo) : !esCalzado(p.tipo) && !esUnica(p.tipo)))
    .map((p) => p.talla);
  if (tallas.length === 0) return null;
  const cuenta = new Map<string, number>();
  for (const t of tallas) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Tallas de un disfraz alquilado: las de sus piezas propias (catálogo); si no tiene (a medida), las
// de la reserva y, en última instancia, las de las piezas que tenía puestas.
export function tallasDelDisfraz(d: {
  prendasHogar?: { tipo: string; talla: string }[];
  prendasActuales?: { tipo: string; talla: string }[];
  reservas?: { tallaRopa: string | null; tallaCalzado: string | null }[];
}): { ropa: string | null; calzado: string | null } {
  const reserva = d.reservas?.[0];
  return {
    ropa: tallaPrincipal(d.prendasHogar, "ROPA") ?? reserva?.tallaRopa ?? tallaPrincipal(d.prendasActuales, "ROPA"),
    calzado: tallaPrincipal(d.prendasHogar, "CALZADO") ?? reserva?.tallaCalzado ?? tallaPrincipal(d.prendasActuales, "CALZADO"),
  };
}

export interface FiltrosHistorial {
  estado?: EstadoVisible;
  busqueda?: string; // cliente (nombre o correo) o disfraz
}

export async function historialAlquileres(filtros: FiltrosHistorial = {}) {
  const alquileres = await prisma.alquiler.findMany({
    include: {
      usuario: { select: { nombre: true, email: true } },
      disfraces: { include: { disfrazFisico: {
            select: {
              id: true,
              nombre: true,
              prendasHogar: { select: { tipo: true, talla: true } },
              prendasActuales: { select: { tipo: true, talla: true } },
              // Un disfraz a medida no tiene piezas propias: las tallas son las que pidió el cliente.
              reservas: { where: { tipo: "A_MEDIDA" }, select: { tallaRopa: true, tallaCalzado: true }, orderBy: { creadoEn: "desc" }, take: 1 },
            },
          },
        },
      },
      devolucion: { select: { fechaDevolucion: true, estado: true, garantiaEstado: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const ahora = new Date();
  const busqueda = filtros.busqueda?.trim().toLowerCase();
  const filas = alquileres
    .map((a: any) => {
      const dias = Math.max(1, Math.round((a.fechaFin.getTime() - a.fechaInicio.getTime()) / 86_400_000));
      return {
        id: a.id,
        cliente: { nombre: a.usuario.nombre, email: a.usuario.email },
        disfraces: a.disfraces.map((d: any) => ({
          id: d.disfrazFisico.id,
          nombre: d.disfrazFisico.nombre,
          tallaRopa: tallasDelDisfraz(d.disfrazFisico).ropa,
          tallaCalzado: tallasDelDisfraz(d.disfrazFisico).calzado,
        })),
        fechaInicio: a.fechaInicio,
        fechaFin: a.fechaFin,
        dias,
        montoTotal: Number(a.montoTotal),
        descuento: Number(a.descuento),
        montoGarantia: Number(a.montoGarantia),
        estado: a.estado as string,
        estadoVisible: estadoVisibleDeAlquiler(a, ahora),
        devolucion: a.devolucion ?? null,
        creadoEn: a.creadoEn,
      };
    })
    .filter((f) => !filtros.estado || f.estadoVisible === filtros.estado)
    .filter(
      (f) =>
        !busqueda ||
        f.cliente.nombre.toLowerCase().includes(busqueda) ||
        f.cliente.email.toLowerCase().includes(busqueda) ||
        f.disfraces.some((d: { nombre: string }) => d.nombre.toLowerCase().includes(busqueda))
    );

  const conteo: Record<string, number> = {};
  for (const f of filas) conteo[f.estadoVisible] = (conteo[f.estadoVisible] ?? 0) + 1;
  // El total solo suma alquileres no cancelados.
  const totalIngresos = filas.filter((f) => f.estado !== "CANCELADO").reduce((acc, f) => acc + f.montoTotal, 0);

  return { alquileres: filas, conteo, totalIngresos };
}

export async function resumenAdmin() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const hace4Meses = new Date();
  hace4Meses.setMonth(hace4Meses.getMonth() - 3);
  hace4Meses.setDate(1);
  hace4Meses.setHours(0, 0, 0, 0);

  const hace7Dias = new Date();
  hace7Dias.setDate(hace7Dias.getDate() - 6);
  hace7Dias.setHours(0, 0, 0, 0);

  const ahora = new Date();
  const hoyUTC = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));

  const [
    totalAlquileres, alquileresActivos, alquileresProximos, alquileresDelMes, ultimos,
    alquileresUltimos4Meses, disfracesAlquilados, alquileresUltimos7Dias, devolucionesPendientes,
    disfracesTodos,
  ] = await Promise.all([
    prisma.alquiler.count(),
    prisma.alquiler.count({ where: { estado: "ACTIVO", fechaInicio: { lte: hoyUTC }, fechaFin: { gte: hoyUTC } } }),
    prisma.alquiler.count({ where: { estado: "ACTIVO", fechaInicio: { gt: hoyUTC } } }),
    prisma.alquiler.findMany({ where: { creadoEn: { gte: inicioMes } }, select: { montoTotal: true } }),
    prisma.alquiler.findMany({ take: 5, orderBy: { creadoEn: "desc" }, include: { usuario: { select: { nombre: true } } } }),
    prisma.alquiler.findMany({ where: { creadoEn: { gte: hace4Meses } }, select: { creadoEn: true, montoTotal: true } }),
    prisma.alquilerDisfraz.findMany({ select: { disfrazFisico: { select: { tipoDisfraz: true } } } }),
    prisma.alquiler.findMany({ where: { creadoEn: { gte: hace7Dias } }, select: { creadoEn: true } }),
    prisma.devolucion.count({ where: { garantiaEstado: "PENDIENTE" } }),
    prisma.disfrazFisico.findMany({ where: { origen: "CATALOGO" }, include: { prendasHogar: true } }),
  ]);

  const ingresosMes = alquileresDelMes.reduce((s: number, a: { montoTotal: unknown }) => s + Number(a.montoTotal), 0);

  const mesesLabels: string[] = [];
  const hoy = new Date();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    mesesLabels.push(`${NOMBRE_MES[d.getMonth()]}-${d.getFullYear()}`);
  }
  const ingresosPorMes: Record<string, number> = Object.fromEntries(mesesLabels.map((m) => [m, 0]));
  for (const a of alquileresUltimos4Meses as { creadoEn: Date; montoTotal: unknown }[]) {
    const d = new Date(a.creadoEn);
    const clave = `${NOMBRE_MES[d.getMonth()]}-${d.getFullYear()}`;
    if (clave in ingresosPorMes) ingresosPorMes[clave] += Number(a.montoTotal);
  }
  const ingresosMensuales = mesesLabels.map((clave) => ({ mes: clave.split("-")[0], ingresos: Math.round(ingresosPorMes[clave] * 100) / 100 }));

  const conteoTipo: Record<string, number> = {};
  for (const ad of disfracesAlquilados as { disfrazFisico: { tipoDisfraz: string } }[]) {
    const etiqueta = ad.disfrazFisico.tipoDisfraz;
    conteoTipo[etiqueta] = (conteoTipo[etiqueta] || 0) + 1;
  }
  const porCategoria = Object.entries(conteoTipo).map(([categoria, valor]) => ({ categoria, valor }));

  const diasLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    diasLabels.push(NOMBRE_DIA[d.getDay()]);
  }
  const conteoDia: Record<string, number> = Object.fromEntries(diasLabels.map((d) => [d, 0]));
  for (const a of alquileresUltimos7Dias as { creadoEn: Date }[]) {
    const dia = NOMBRE_DIA[new Date(a.creadoEn).getDay()];
    if (dia in conteoDia) conteoDia[dia] += 1;
  }
  const alquileresPorDia = diasLabels.map((dia) => ({ dia, cantidad: conteoDia[dia] }));

  const disfracesIncompletos = (disfracesTodos as { id: string; nombre: string; prendasHogar: { disfrazActualId: string; estado: string }[] }[])
    .filter((d) => !d.prendasHogar.every((p) => p.disfrazActualId === d.id && p.estado === "DISPONIBLE"))
    .map((d) => ({ nombre: d.nombre, detalle: "Disfraz incompleto — falta reponer prenda(s)", unidades: 0 }));

  return {
    totalAlquileres, alquileresActivos, alquileresProximos, ingresosMes, devolucionesPendientes,
    ultimosAlquileres: (ultimos as any[]).map((a) => ({
      cliente: a.usuario.nombre,
      monto: Number(a.montoTotal),
      estado: a.estado === "ACTIVO" ? "activo" : "completado",
    })),
    ingresosMensuales,
    porCategoria,
    alquileresPorDia,
    alertasStock: disfracesIncompletos,
  };
}
