import { proponerArmado } from "./armado.service";
import type { PropuestaArmado, TallasPedido } from "./armado.service";
import { ErrorReserva, listarReservasActivas, reservarAMedida } from "./reservas.service";

// Lo que ve el cliente de una propuesta. No incluye de qué disfraz sale cada pieza ni qué
// disfraces se verían afectados: eso es información interna que solo queda en la auditoría.
function piezasParaCliente(p: PropuestaArmado) {
  return p.piezas.map((x) => ({
    huecoId: x.huecoId,
    etiqueta: x.etiqueta,
    tipo: x.tipo,
    nombre: x.nombre,
    color: x.color,
    talla: x.talla,
    obligatoria: x.obligatoria,
  }));
}

function vistaPropuesta(p: PropuestaArmado) {
  return {
    receta: { id: p.receta.id, nombre: p.receta.nombre, precioDia: p.receta.precioDia },
    completo: p.completo,
    piezas: piezasParaCliente(p),
    omitidas: p.omitidas.map((o) => ({ huecoId: o.huecoId, etiqueta: o.etiqueta, motivo: o.motivo })),
    faltantes: p.faltantes.map((f) => ({
      huecoId: f.huecoId,
      etiqueta: f.etiqueta,
      tipo: f.tipo,
      tallaPedida: f.tallaPedida,
      motivo: f.motivo,
      tallasDisponibles: f.tallasDisponibles,
    })),
    opciones: p.opciones,
  };
}

// Calcula la propuesta sin reservar ni mover ninguna pieza.
export async function previsualizar(recetaId: string, tallas: TallasPedido) {
  const propuesta = await proponerArmado(recetaId, tallas);
  if (!propuesta.receta.activa) throw new ErrorReserva("Esta receta no está disponible.", 404);
  return vistaPropuesta(propuesta);
}

const segundosHasta = (fecha: Date) => Math.max(0, Math.round((fecha.getTime() - Date.now()) / 1000));

// Aparta las piezas y crea el disfraz a medida. `auditoria` es el texto para el registro interno.
export async function reservar(usuarioId: string, recetaId: string, tallas: TallasPedido, peticion?: string) {
  const r = await reservarAMedida(usuarioId, recetaId, tallas, peticion);
  const p = r.propuesta;

  const afectados = p.disfracesAfectados.map((d) => `${d.nombre} (${d.piezasTomadas})`).join(", ");

  return {
    reserva: {
      reservaId: r.reservaId,
      disfrazId: r.disfrazId,
      nombre: r.nombre,
      tipoDisfraz: "A medida",
      precioDia: p.receta.precioDia,
      vence: r.vence,
      segundosRestantes: segundosHasta(r.vence),
      receta: p.receta.nombre,
      piezas: piezasParaCliente(p),
      omitidas: p.omitidas.map((o) => ({ huecoId: o.huecoId, etiqueta: o.etiqueta, motivo: o.motivo })),
    },
    auditoria:
      `${p.receta.nombre} · ${p.piezas.length} piezas · ${p.piezasDeOtros} de otros disfraces` +
      (afectados ? ` [${afectados}]` : ""),
  };
}

export async function misReservas(usuarioId: string) {
  const lista = await listarReservasActivas(usuarioId);
  return lista.map((r) => ({
    reservaId: r.id,
    tipo: r.tipo,
    vence: r.vence,
    segundosRestantes: r.segundosRestantes,
    receta: r.receta,
    disfraz: {
      id: r.disfraz.id,
      nombre: r.disfraz.nombre,
      tipoDisfraz: r.tipo === "A_MEDIDA" ? "A medida" : "Catálogo",
      precioDia: Number(r.disfraz.precioAlquiler),
    },
    piezas: r.disfraz.prendasActuales.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo as string,
      color: p.color,
      talla: p.talla,
    })),
  }));
}