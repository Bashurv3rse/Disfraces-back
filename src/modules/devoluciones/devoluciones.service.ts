import { prisma } from "../../config/prisma";
import { CrearDevolucionInput } from "./devoluciones.schema";
import { buscarCandidatos } from "../disfraces/disfraces.service";

// Misma lógica (y mismo orden de similitud) que la búsqueda manual del
// administrador: solo prendas de disfraces del mismo grupo de compatibilidad.
async function buscarDonante(prendaId: string, disfrazNecesitadoId: string) {
  const candidatos = await buscarCandidatos(prendaId, disfrazNecesitadoId);
  return candidatos.find((c) => !c.disfrazOrigenAlquilado) || null;
}

export async function crearDevolucion(datos: CrearDevolucionInput, usuarioId: string) {
  const alquiler = await prisma.alquiler.findFirst({
    where: { id: datos.alquilerId, usuarioId },
    include: { disfraces: true },
  });
  if (!alquiler) {
    throw new Error("Alquiler no encontrado");
  }

  const devolucion = await prisma.devolucion.create({
    data: {
      alquilerId: datos.alquilerId,
      fechaDevolucion: new Date(datos.fechaDevolucion),
      observaciones: datos.observaciones,
      estado: "APROBADA",
      prendas: {
        create: datos.prendas.map((p) => ({ prendaId: p.prendaId, estadoPrenda: p.estadoPrenda })),
      },
    },
  });

  await prisma.alquiler.update({ where: { id: datos.alquilerId }, data: { estado: "FINALIZADO" } });

  // Todo disfraz devuelto entra en "suspensión" (lavado, planchado, empaquetado:
  // 3 días hábiles) sin importar el estado en que haya vuelto.
  const disfrazIds = [...new Set(alquiler.disfraces.map((ad: any) => ad.disfrazFisicoId))];
  await prisma.disfrazFisico.updateMany({
    where: { id: { in: disfrazIds } },
    data: { estadoManual: "SUSPENDIDO", fechaSuspension: new Date() },
  });

  // Paso 1: registrar el estado reportado de TODAS las prendas con problema antes de
  // buscar reemplazos. Así una prenda que esta misma devolución reporta como dañada
  // nunca puede ofrecerse como donante de otra.
  const afectadas: { prenda: { id: string; nombre: string; disfrazActualId: string }; estadoPrenda: string }[] = [];
  for (const item of datos.prendas) {
    if (item.estadoPrenda === "BUEN_ESTADO") continue;
    const prenda = await prisma.prenda.update({
      where: { id: item.prendaId },
      data: { estado: item.estadoPrenda },
    });
    afectadas.push({ prenda, estadoPrenda: item.estadoPrenda });
  }

  // Paso 2: buscar y aplicar un reemplazo compatible para cada una. El reemplazo va al
  // disfraz donde la prenda estaba EN USO (disfrazActualId), que no siempre es su
  // disfraz de origen: si era una pieza prestada, el hueco está en el disfraz devuelto.
  const sustituciones: { prenda: string; disfrazNecesitado: string }[] = [];

  for (const { prenda, estadoPrenda } of afectadas) {
    const necesitadoId = prenda.disfrazActualId;
    const donante = await buscarDonante(prenda.id, necesitadoId);
    if (!donante) continue;

    await prisma.prenda.update({
      where: { id: donante.id },
      data: { disfrazActualId: necesitadoId },
    });
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
    },
    orderBy: { creadoEn: "desc" },
  });
}