import { prisma } from "../../config/prisma";
import { CrearAlquilerInput } from "./alquileres.schema";

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NOMBRE_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export async function crearAlquiler(datos: CrearAlquilerInput, usuarioId: string) {
  const disfraces = await prisma.disfrazFisico.findMany({ where: { id: { in: datos.disfraces } } });
  const montoTotal = disfraces.reduce((s: number, d: { precioAlquiler: unknown }) => s + Number(d.precioAlquiler), 0);
  const montoGarantia = Math.round(montoTotal * 0.2 * 100) / 100;

  return prisma.alquiler.create({
    data: {
      usuarioId,
      fechaInicio: new Date(datos.fechaInicio),
      fechaFin: new Date(datos.fechaFin),
      evento: datos.evento,
      estado: "ACTIVO",
      montoTotal,
      montoGarantia,
      disfraces: {
        create: disfraces.map((d: { id: string; precioAlquiler: unknown }) => ({
          disfrazFisicoId: d.id,
          precioUnitario: d.precioAlquiler as any,
        })),
      },
    },
    include: { disfraces: { include: { disfrazFisico: true } } },
  });
}

export function listarPropios(usuarioId: string) {
  return prisma.alquiler.findMany({
    where: { usuarioId },
    include: { disfraces: { include: { disfrazFisico: { include: { prendasActuales: true } } } } },
    orderBy: { creadoEn: "desc" },
  });
}

export function listarTodos() {
  return prisma.alquiler.findMany({
    include: { disfraces: { include: { disfrazFisico: true } }, usuario: { select: { nombre: true, email: true } } },
    orderBy: { creadoEn: "desc" },
  });
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
    prisma.devolucion.count({ where: { estado: "PENDIENTE" } }),
    prisma.disfrazFisico.findMany({ include: { prendasHogar: true } }),
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