import { prisma } from "../../config/prisma";
import { CrearDevolucionInput } from "./devoluciones.schema";

async function buscarDonante(tipo: string, prendaNecesitadaId: string) {
  const candidatas = await prisma.prenda.findMany({
    where: { tipo: tipo as any, estado: "DISPONIBLE", id: { not: prendaNecesitadaId } },
  });
  const enCasa = candidatas.filter((p: any) => p.disfrazActualId === p.disfrazHogarId);
  if (enCasa.length === 0) return null;

  const disfrazIds = enCasa.map((p: any) => p.disfrazHogarId);
  const ocupados = await prisma.alquilerDisfraz.findMany({
    where: { disfrazFisicoId: { in: disfrazIds }, alquiler: { estado: { in: ["ACTIVO", "PENDIENTE"] } } },
    select: { disfrazFisicoId: true },
  });
  const idsOcupados = new Set(ocupados.map((o: { disfrazFisicoId: string }) => o.disfrazFisicoId));
  return enCasa.find((p: any) => !idsOcupados.has(p.disfrazHogarId)) || null;
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

  // Todo disfraz devuelto entra en "suspensión" (lavado → planchado → empaquetado,
  // 3 días hábiles) sin importar el estado en que haya vuelto. Se libera solo,
  // sincronizado con el reloj real — no hace falta que el admin lo confirme.
  const disfrazIds = [...new Set(alquiler.disfraces.map((ad: any) => ad.disfrazFisicoId))];
  await prisma.disfrazFisico.updateMany({
    where: { id: { in: disfrazIds } },
    data: { estadoManual: "SUSPENDIDO", fechaSuspension: new Date() },
  });

  const sustituciones: { prenda: string; disfrazNecesitado: string }[] = [];

  for (const item of datos.prendas) {
    if (item.estadoPrenda === "BUEN_ESTADO") continue;

    const prendaNecesitada = await prisma.prenda.update({
      where: { id: item.prendaId },
      data: { estado: item.estadoPrenda },
    });

    const donante = await buscarDonante(prendaNecesitada.tipo, prendaNecesitada.id);
    if (donante) {
      await prisma.prenda.update({
        where: { id: donante.id },
        data: { disfrazActualId: prendaNecesitada.disfrazHogarId },
      });
      const disfrazDestino = await prisma.disfrazFisico.findUnique({ where: { id: prendaNecesitada.disfrazHogarId } });
      await prisma.sustitucion.create({
        data: {
          prendaId: donante.id,
          disfrazOrigenId: donante.disfrazHogarId,
          disfrazDestinoId: prendaNecesitada.disfrazHogarId,
          motivo: `${prendaNecesitada.nombre} reportada como ${item.estadoPrenda === "DANADA" ? "dañada" : "faltante"} en ${disfrazDestino?.nombre}`,
        },
      });
      sustituciones.push({ prenda: donante.nombre, disfrazNecesitado: disfrazDestino?.nombre || "" });
    }
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