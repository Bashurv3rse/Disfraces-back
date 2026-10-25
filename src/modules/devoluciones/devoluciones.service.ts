import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { CrearDevolucionInput } from "./devoluciones.schema";
import { buscarCandidatos } from "../disfraces/disfraces.service";

// Error de regla de negocio, con el código HTTP que debe devolver el controller.
export class ErrorDevolucion extends Error {
  constructor(mensaje: string, public readonly estado: number) {
    super(mensaje);
  }
}

// Misma lógica (y mismo orden de similitud) que la búsqueda manual del administrador.
async function buscarDonante(prendaId: string, disfrazNecesitadoId: string) {
  const candidatos = await buscarCandidatos(prendaId, disfrazNecesitadoId);
  // Del almacén solo se toma un repuesto de la misma talla; de otros disfraces, como antes.
  return candidatos.find((c) => !c.disfrazOrigenAlquilado && (!c.esAlmacen || c.mismaTalla)) || null;
}

// La devolución, el lavado y el cierre del alquiler ocurren juntos: o se hace todo o nada. El
// disfraz entra en lavado ANTES de que el alquiler figure como finalizado, así el desarmado de
// un disfraz a medida nunca puede adelantarse.
async function registrarDevolucion(datos: CrearDevolucionInput, fecha: Date, disfrazIds: string[]) {
  try {
    const [devolucion] = await prisma.$transaction([
      prisma.devolucion.create({
        data: {
          alquilerId: datos.alquilerId,
          fechaDevolucion: fecha,
          observaciones: datos.observaciones,
          estado: "APROBADA",
          prendas: { create: datos.prendas.map((p) => ({ prendaId: p.prendaId, estadoPrenda: p.estadoPrenda })) },
        },
      }),
      // Todo disfraz devuelto entra en lavado (3 días hábiles) sin importar el estado en que vuelva.
      prisma.disfrazFisico.updateMany({
        where: { id: { in: disfrazIds } },
        data: { estadoManual: "SUSPENDIDO", fechaSuspension: new Date() },
      }),
      prisma.alquiler.update({ where: { id: datos.alquilerId }, data: { estado: "FINALIZADO" } }),
    ]);
    return devolucion;
  } catch (error) {
    // Dos envíos casi simultáneos del mismo alquiler: el segundo choca con la restricción de unicidad.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ErrorDevolucion("Este alquiler ya fue devuelto.", 409);
    }
    throw error;
  }
}

export async function crearDevolucion(datos: CrearDevolucionInput, usuarioId: string) {
  const fecha = new Date(datos.fechaDevolucion);
  if (Number.isNaN(fecha.getTime())) throw new ErrorDevolucion("La fecha de devolución no es válida.", 400);

  const alquiler = await prisma.alquiler.findFirst({
    where: { id: datos.alquilerId, usuarioId },
    include: { disfraces: true },
  });
  if (!alquiler) throw new ErrorDevolucion("Alquiler no encontrado", 404);
  if (alquiler.estado === "FINALIZADO" || alquiler.estado === "CANCELADO") {
    throw new ErrorDevolucion("Este alquiler ya fue devuelto.", 409);
  }

  const disfrazIds = [...new Set(alquiler.disfraces.map((ad: any) => ad.disfrazFisicoId as string))];

  // El reporte debe cubrir EXACTAMENTE las prendas que el cliente tiene ahora. Sin esto, un
  // cliente podría cambiar el estado de cualquier prenda del sistema.
  const delAlquiler = await prisma.prenda.findMany({ where: { disfrazActualId: { in: disfrazIds } }, select: { id: true } });
  const validas = new Set(delAlquiler.map((p) => p.id));
  const reportadas = datos.prendas.map((p) => p.prendaId);

  if (new Set(reportadas).size !== reportadas.length) {
    throw new ErrorDevolucion("Hay prendas repetidas en el reporte.", 400);
  }
  if (reportadas.some((id) => !validas.has(id))) {
    throw new ErrorDevolucion("El reporte incluye prendas que no pertenecen a este alquiler.", 400);
  }
  if (validas.size !== reportadas.length) {
    throw new ErrorDevolucion("Debes reportar el estado de todas las prendas del alquiler.", 400);
  }

  const devolucion = await registrarDevolucion(datos, fecha, disfrazIds);

  // Paso 1: registrar el estado reportado de TODAS las prendas con problema antes de buscar
  // reemplazos, para que una pieza que esta devolución reporta como dañada no se ofrezca como donante.
  const afectadas: { prenda: { id: string; nombre: string; disfrazActualId: string; disfrazHogarId: string }; estadoPrenda: string }[] = [];
  for (const item of datos.prendas) {
    if (item.estadoPrenda === "BUEN_ESTADO") continue;
    const prenda = await prisma.prenda.update({ where: { id: item.prendaId }, data: { estado: item.estadoPrenda } });
    afectadas.push({ prenda, estadoPrenda: item.estadoPrenda });
  }

  // Paso 2: buscar y aplicar un reemplazo compatible para cada una. El reemplazo va al disfraz
  // donde la prenda estaba EN USO (disfrazActualId). Un disfraz a medida no recibe reemplazos:
  // se desarma solo al terminar su lavado.
  const sustituciones: { prenda: string; disfrazNecesitado: string }[] = [];
  for (const { prenda, estadoPrenda } of afectadas) {
    const necesitadoId = prenda.disfrazActualId;
    // Una pieza que llegó por un ajuste de talla vuelve sola a su origen (con su estado) al desarmar la
    // reserva, y el disfraz recupera su pieza original: no hace falta buscar un reemplazo.
    const porAjuste = await prisma.movimientoPrenda.count({
      where: { prendaId: prenda.id, haciaId: necesitadoId, reserva: { tipo: "AJUSTE_TALLA", liberadaEn: null } },
    });
    if (porAjuste > 0) continue;
    const donante = await buscarDonante(prenda.id, necesitadoId);
    if (!donante) continue;

    await prisma.prenda.update({ where: { id: donante.id }, data: { disfrazActualId: necesitadoId } });
    const disfrazDestino = await prisma.disfrazFisico.findUnique({ where: { id: necesitadoId } });
    await prisma.sustitucion.create({
      data: {
        prendaId: donante.id,
        disfrazOrigenId: donante.disfrazOrigenId,
        disfrazDestinoId: necesitadoId,
        motivo: `${prenda.nombre} reportada como ${estadoPrenda === "DANADA" ? "dañada" : "faltante"} en ${disfrazDestino?.nombre}`,
      },
    });
    sustituciones.push({ prenda: donante.nombre, disfrazNecesitado: disfrazDestino?.nombre || "" });
  }

  return { devolucion, sustituciones };
}

export function listarDevoluciones() {
  return prisma.devolucion.findMany({
    include: {
      alquiler: {
        include: {
          usuario: { select: { nombre: true, email: true } },
          disfraces: { include: { disfrazFisico: true } },
        },
      },
      prendas: { include: { prenda: true } },
      resueltaPor: { select: { nombre: true } },
    },
    orderBy: { creadoEn: "desc" },
  });
}