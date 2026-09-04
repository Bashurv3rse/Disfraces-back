import { prisma } from "../../config/prisma";
import { CrearAlquilerInput } from "./alquileres.schema";

interface PiezaResumen {
  id: string;
  precioAlquiler: unknown;
}

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NOMBRE_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const ETIQUETA_TIPO: Record<string, string> = {
  SOMBRERO: "Sombreros",
  CAMISA_POLO: "Camisas/Polos",
  PANTALON: "Pantalones",
  ZAPATO_ZAPATILLA: "Zapatos",
  ABRIGO: "Abrigos",
  CHALECO: "Chalecos",
  TRAJE: "Trajes",
  TACON: "Tacones",
  ACCESORIO: "Accesorios",
};

export async function crearAlquiler(datos: CrearAlquilerInput, usuarioId: string) {
  const piezas = await prisma.pieza.findMany({ where: { id: { in: datos.piezaIds } } });
  const montoTotal = piezas.reduce((suma: number, p: PiezaResumen) => suma + Number(p.precioAlquiler), 0);

  return prisma.alquiler.create({
    data: {
      usuarioId,
      fechaInicio: new Date(datos.fechaInicio),
      fechaFin: new Date(datos.fechaFin),
      evento: datos.evento,
      montoTotal,
      piezas: {
        create: piezas.map((p: PiezaResumen) => ({ piezaId: p.id, precioUnitario: p.precioAlquiler as any })),
      },
    },
    include: { piezas: { include: { pieza: true } } },
  });
}

export function listarPropios(usuarioId: string) {
  return prisma.alquiler.findMany({
    where: { usuarioId },
    include: { piezas: { include: { pieza: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export function listarTodos() {
  return prisma.alquiler.findMany({
    include: { piezas: { include: { pieza: true } }, usuario: { select: { nombre: true, email: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export async function eliminarAlquiler(id: string, usuarioId: string) {
  await prisma.alquilerPieza.deleteMany({ where: { alquilerId: id } });
  return prisma.alquiler.deleteMany({ where: { id, usuarioId } });
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

  const [
    totalAlquileres,
    alquileresActivos,
    alquileresDelMes,
    ultimos,
    alquileresUltimos4Meses,
    piezasAlquiladas,
    alquileresUltimos7Dias,
    alertasStock,
    devolucionesPendientes,
  ] = await Promise.all([
    prisma.alquiler.count(),
    prisma.alquiler.count({ where: { estado: "ACTIVO" } }),
    prisma.alquiler.findMany({ where: { creadoEn: { gte: inicioMes } }, select: { montoTotal: true } }),
    prisma.alquiler.findMany({
      take: 5,
      orderBy: { creadoEn: "desc" },
      include: { usuario: { select: { nombre: true } } },
    }),
    prisma.alquiler.findMany({
      where: { creadoEn: { gte: hace4Meses } },
      select: { creadoEn: true, montoTotal: true },
    }),
    prisma.alquilerPieza.findMany({ select: { pieza: { select: { tipo: true } } } }),
    prisma.alquiler.findMany({
      where: { creadoEn: { gte: hace7Dias } },
      select: { creadoEn: true },
    }),
    prisma.pieza.findMany({
      where: { stock: { lte: 6 } },
      orderBy: { stock: "asc" },
      take: 6,
      select: { nombre: true, color: true, modelo: true, stock: true },
    }),
    prisma.devolucion.count({ where: { estado: "PENDIENTE" } }),
  ]);

  const ingresosMes = alquileresDelMes.reduce(
    (s: number, a: { montoTotal: unknown }) => s + Number(a.montoTotal),
    0
  );

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
  const ingresosMensuales = mesesLabels.map((clave) => ({
    mes: clave.split("-")[0],
    ingresos: Math.round(ingresosPorMes[clave] * 100) / 100,
  }));

  const conteoTipo: Record<string, number> = {};
  for (const ap of piezasAlquiladas as { pieza: { tipo: string } }[]) {
    const etiqueta = ETIQUETA_TIPO[ap.pieza.tipo] || ap.pieza.tipo;
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

  return {
    totalAlquileres,
    alquileresActivos,
    ingresosMes,
    devolucionesPendientes,
    ultimosAlquileres: ultimos.map((a: any) => ({
      cliente: a.usuario.nombre,
      monto: Number(a.montoTotal),
      estado: a.estado === "ACTIVO" ? "activo" : "completado",
    })),
    ingresosMensuales,
    porCategoria,
    alquileresPorDia,
    alertasStock: alertasStock.map((p: { nombre: string; color: string; modelo: string | null; stock: number }) => ({
      nombre: p.nombre,
      detalle: [p.color, p.modelo].filter(Boolean).join(" · "),
      unidades: p.stock,
    })),
  };
}