import { prisma } from "../../config/prisma";
import { fechaLiberacionLavado, infoLavado, limpiarSuspensionesVencidas } from "../disfraces/disfraces.service";
import type { FaseLavado } from "../disfraces/disfraces.service";

const MAX_PETICIONES = 2000;

export class ErrorAdminAMedida extends Error {
  constructor(mensaje: string, public readonly estado: number) {
    super(mensaje);
  }
}

export interface GrupoDemanda {
  textoNormalizado: string;
  veces: number;
  personas: number;
  primera: Date;
  ultima: Date;
  ejemplos: string[];
}

// Pedidos de disfraces que no tienen receta, agrupados por lo que se pidió.
export async function listarDemanda() {
  const [filas, total, conReceta, atendidasSinReceta] = await Promise.all([
    prisma.peticionDisfraz.findMany({
      where: { recetaId: null, atendida: false },
      select: { textoNormalizado: true, texto: true, usuarioId: true, creadoEn: true },
      orderBy: { creadoEn: "desc" },
      take: MAX_PETICIONES,
    }),
    prisma.peticionDisfraz.count(),
    prisma.peticionDisfraz.count({ where: { recetaId: { not: null } } }),
    prisma.peticionDisfraz.count({ where: { recetaId: null, atendida: true } }),
  ]);

  const mapa = new Map<string, { veces: number; usuarios: Set<string>; primera: Date; ultima: Date; ejemplos: string[] }>();
  for (const f of filas) {
    const g = mapa.get(f.textoNormalizado) ?? {
      veces: 0,
      usuarios: new Set<string>(),
      primera: f.creadoEn,
      ultima: f.creadoEn,
      ejemplos: [],
    };
    g.veces++;
    g.usuarios.add(f.usuarioId);
    if (f.creadoEn < g.primera) g.primera = f.creadoEn;
    if (f.creadoEn > g.ultima) g.ultima = f.creadoEn;
    const texto = f.texto.trim();
    if (g.ejemplos.length < 3 && !g.ejemplos.includes(texto)) g.ejemplos.push(texto);
    mapa.set(f.textoNormalizado, g);
  }

  const grupos: GrupoDemanda[] = Array.from(mapa.entries())
    .map(([textoNormalizado, g]) => ({
      textoNormalizado,
      veces: g.veces,
      personas: g.usuarios.size,
      primera: g.primera,
      ultima: g.ultima,
      ejemplos: g.ejemplos,
    }))
    // Lo más pedido primero; a igualdad, lo más reciente.
    .sort((a, b) => b.veces - a.veces || b.personas - a.personas || b.ultima.getTime() - a.ultima.getTime());

  return {
    grupos,
    resumen: {
      pedidosPendientes: filas.length,
      gruposPendientes: grupos.length,
      totalPedidos: total,
      conReceta,
      atendidosSinReceta: atendidasSinReceta,
    },
    // Si se llegó al tope, puede haber pedidos más antiguos que no se están contando.
    truncado: filas.length >= MAX_PETICIONES,
  };
}

// «Marcar como atendido»: el admin decidió no crear receta para este pedido.
export async function marcarDemandaAtendida(textoNormalizado: string) {
  const texto = textoNormalizado.trim();
  if (!texto) throw new ErrorAdminAMedida("Falta indicar qué pedido se marca como atendido.", 400);

  const { count } = await prisma.peticionDisfraz.updateMany({
    where: { textoNormalizado: texto, recetaId: null, atendida: false },
    data: { atendida: true },
  });
  if (count === 0) throw new ErrorAdminAMedida("No hay pedidos pendientes con ese texto.", 404);
  return { marcados: count };
}

export type EstadoEnCurso = "ALQUILADO" | "EN_LAVADO" | "POR_DESARMAR";

export interface PiezaEnCurso {
  id: string;
  nombre: string;
  talla: string;
  estado: string;
  procedencia: string | null;
}

export interface ReservaEnCurso {
  reservaId: string;
  tipo: "A_MEDIDA" | "AJUSTE_TALLA";
  confirmadaEn: Date | null;
  disfraz: { id: string; nombre: string };
  estado: EstadoEnCurso;
  cliente: { nombre: string; email: string } | null;
  alquiler: { id: string; estado: string; fechaInicio: Date | null; fechaFin: Date | null } | null;
  lavado: { dias: number; fase: FaseLavado; liberaEl: Date } | null;
  piezas: PiezaEnCurso[];
}

// Reservas pagadas que todavía no se desarman: disfraces a medida y disfraces del catálogo con tallas
// ajustadas. En un ajuste, `piezas` son las que entraron por el intercambio (las que deben volver a su origen).
// Al consultar esta pantalla también se ejecuta el desarmado de los que ya terminaron.
export async function listarEnCurso(): Promise<ReservaEnCurso[]> {
  await limpiarSuspensionesVencidas();

  const reservas = await prisma.reserva.findMany({
    where: { confirmadaEn: { not: null }, liberadaEn: null, tipo: { in: ["A_MEDIDA", "AJUSTE_TALLA"] } },
    orderBy: { confirmadaEn: "desc" },
    select: {
      id: true,
      tipo: true,
      confirmadaEn: true,
      disfrazFisicoId: true,
      disfrazFisico: {
        select: {
          id: true,
          nombre: true,
          estadoManual: true,
          fechaSuspension: true,
          alquileres: {
            select: {
              alquiler: {
                select: {
                  id: true,
                  estado: true,
                  fechaInicio: true,
                  fechaFin: true,
                  usuario: { select: { nombre: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (reservas.length === 0) return [];

  const prendas = await prisma.prenda.findMany({
    where: { disfrazActualId: { in: reservas.map((r) => r.disfrazFisicoId) } },
    select: { id: true, nombre: true, talla: true, estado: true, disfrazActualId: true, disfrazHogarId: true },
  });
  const hogares = await prisma.disfrazFisico.findMany({
    where: { id: { in: [...new Set(prendas.map((p) => p.disfrazHogarId))] } },
    select: { id: true, nombre: true },
  });
  const nombreHogar = new Map(hogares.map((h) => [h.id, h.nombre]));

  return reservas.map((r) => {
    const alquileres = r.disfrazFisico.alquileres.map((a) => a.alquiler);
    const activo = alquileres.find((a) => a.estado === "ACTIVO" || a.estado === "PENDIENTE");
    const ref = activo ?? alquileres[alquileres.length - 1] ?? null;

    const enLavado = r.disfrazFisico.estadoManual === "SUSPENDIDO" && r.disfrazFisico.fechaSuspension;
    const estado: EstadoEnCurso = activo ? "ALQUILADO" : enLavado ? "EN_LAVADO" : "POR_DESARMAR";

    let lavado: ReservaEnCurso["lavado"] = null;
    if (enLavado) {
      const { dias, fase } = infoLavado(r.disfrazFisico.fechaSuspension!);
      lavado = { dias, fase, liberaEl: fechaLiberacionLavado(r.disfrazFisico.fechaSuspension!) };
    }

    return {
      reservaId: r.id,
      tipo: r.tipo,
      confirmadaEn: r.confirmadaEn,
      disfraz: { id: r.disfrazFisico.id, nombre: r.disfrazFisico.nombre },
      estado,
      cliente: ref?.usuario ?? null,
      alquiler: ref
        ? { id: ref.id, estado: ref.estado, fechaInicio: ref.fechaInicio ?? null, fechaFin: ref.fechaFin ?? null }
        : null,
      lavado,
      piezas: prendas
        .filter((p) => p.disfrazActualId === r.disfrazFisicoId && (r.tipo === "A_MEDIDA" || p.disfrazHogarId !== r.disfrazFisicoId))
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          talla: p.talla,
          estado: p.estado as string,
          procedencia: nombreHogar.get(p.disfrazHogarId) ?? null,
        })),
    };
  });
}