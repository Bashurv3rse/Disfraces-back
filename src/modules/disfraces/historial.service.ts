import { prisma } from "../../config/prisma";

// Error de regla de negocio, con el código HTTP que debe devolver el controller.
export class ErrorHistorial extends Error {
  constructor(mensaje: string, public readonly estado: number) {
    super(mensaje);
  }
}

export type CategoriaEvento =
  | "REGISTRO"
  | "ESTADO"
  | "PRENDA"
  | "PRESTAMO"
  | "ALQUILER"
  | "DEVOLUCION"
  | "INCIDENCIA"
  | "DISPONIBILIDAD";

export interface EventoHistorial {
  fecha: string; // ISO
  categoria: CategoriaEvento;
  titulo: string;
  detalle: string;
}

// --- Registro de los cambios que no se pueden reconstruir desde otras tablas ---

// El historial nunca puede impedir la operación que registra: si el registro falla,
// el cambio de inventario se hace igual.
export async function registrarEventoDisfraz(evento: {
  disfrazId: string;
  tipo: "ESTADO" | "PRENDA";
  detalle: string;
  prendaId?: string;
  usuarioId?: string;
}): Promise<void> {
  try {
    await prisma.eventoDisfraz.create({ data: evento });
  } catch {
    // Se ignora a propósito (ver comentario de arriba).
  }
}

const ETIQUETA_ESTADO_MANUAL: Record<string, string> = {
  EN_REPARACION: "En reparación",
  SUSPENDIDO: "Suspendido",
};

export function etiquetaEstadoManual(estado: string | null | undefined): string {
  return estado ? ETIQUETA_ESTADO_MANUAL[estado] ?? estado : "Sin marca manual (disponible)";
}

const ETIQUETA_ESTADO_PRENDA: Record<string, string> = {
  DISPONIBLE: "disponible",
  DANADA: "dañada",
  FALTANTE: "faltante",
};

export function etiquetaEstadoPrenda(estado: string): string {
  return ETIQUETA_ESTADO_PRENDA[estado] ?? estado.toLowerCase();
}

// --- Fechas ---

const MS_DIA = 86_400_000;

function dia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fechaCorta(d: Date): string {
  const [a, m, di] = dia(d).split("-");
  return `${di}/${m}/${a}`;
}

function diasEntre(inicio: Date, fin: Date): number {
  return Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / MS_DIA));
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

// Los tres días hábiles del lavado se cuentan igual que en el inventario (lunes a viernes).
function liberacionLavado(desde: Date): Date {
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  let habiles = 0;
  while (habiles < 3) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const d = cursor.getUTCDay();
    if (d !== 0 && d !== 6) habiles++;
  }
  return cursor;
}

// --- Historial de un disfraz ---

// Línea de tiempo del disfraz: alta, cambios de estado, prendas, préstamos, alquileres,
// devoluciones, incidencias y cambios de disponibilidad. Solo para los disfraces del catálogo
// principal (no para el almacén ni los disfraces a medida). Devuelve null si no existe.
export async function obtenerHistorialDisfraz(id: string) {
  const disfraz = await prisma.disfrazFisico.findUnique({
    where: { id },
    include: { prendasHogar: { select: { id: true, nombre: true, tipo: true, color: true, talla: true, creadoEn: true } } },
  });
  if (!disfraz) return null;
  if (disfraz.origen !== "CATALOGO") {
    throw new ErrorHistorial("El historial solo está disponible para los disfraces del catálogo principal.", 400);
  }

  const [registrados, alquileres, sustituciones, reservas] = await Promise.all([
    prisma.eventoDisfraz.findMany({ where: { disfrazId: id }, orderBy: { fecha: "asc" } }),
    prisma.alquilerDisfraz.findMany({
      where: { disfrazFisicoId: id },
      include: {
        alquiler: {
          include: {
            usuario: { select: { nombre: true, email: true } },
            devolucion: {
              include: {
                prendas: { include: { prenda: { select: { id: true, nombre: true, disfrazHogarId: true, disfrazActualId: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.sustitucion.findMany({
      where: { OR: [{ disfrazOrigenId: id }, { disfrazDestinoId: id }] },
      include: { prenda: { select: { nombre: true } } },
    }),
    prisma.reserva.findMany({ where: { disfrazFisicoId: id, tipo: "AJUSTE_TALLA" } }),
  ]);

  // Nombres de los otros disfraces que intervinieron en préstamos.
  const otrosIds = [
    ...new Set(sustituciones.flatMap((s) => [s.disfrazOrigenId, s.disfrazDestinoId]).filter((x) => x !== id)),
  ];
  const nombres = new Map<string, string>();
  if (otrosIds.length > 0) {
    const filas = await prisma.disfrazFisico.findMany({ where: { id: { in: otrosIds } }, select: { id: true, nombre: true } });
    for (const f of filas) nombres.set(f.id, f.nombre);
  }
  const nombreDe = (x: string) => nombres.get(x) ?? "otro disfraz";

  const eventos: { cuando: Date; e: Omit<EventoHistorial, "fecha"> }[] = [];
  const agregar = (cuando: Date, categoria: CategoriaEvento, titulo: string, detalle: string) =>
    eventos.push({ cuando, e: { categoria, titulo, detalle } });

  // Alta y prendas incorporadas después del alta.
  const alta = disfraz.creadoEn;
  const iniciales = disfraz.prendasHogar.filter((p) => p.creadoEn.getTime() - alta.getTime() < 60_000);
  agregar(
    alta,
    "REGISTRO",
    "Disfraz registrado",
    `Se registró «${disfraz.nombre}» (${disfraz.tipoDisfraz}, ${disfraz.temporadaEvento}) con ${iniciales.length} prenda${iniciales.length === 1 ? "" : "s"}: ${iniciales
      .map((p) => `${p.nombre} (talla ${p.talla})`)
      .join(", ")}. Tarifa: ${soles(Number(disfraz.precioAlquiler))} por día.`
  );
  for (const p of disfraz.prendasHogar.filter((x) => !iniciales.includes(x))) {
    agregar(p.creadoEn, "PRENDA", "Prenda incorporada", `${p.nombre} (${p.color}, talla ${p.talla}) se agregó al disfraz.`);
  }

  // Cambios guardados al momento de hacerlos (estado manual, cambios en prendas).
  for (const r of registrados) {
    agregar(r.fecha, r.tipo === "ESTADO" ? "ESTADO" : "PRENDA", r.tipo === "ESTADO" ? "Cambio de estado" : "Prenda modificada", r.detalle);
  }

  // Alquileres, devoluciones, lavado e incidencias.
  const ahora = new Date();
  for (const ad of alquileres) {
    const a = ad.alquiler;
    const cliente = `${a.usuario.nombre} (${a.usuario.email})`;
    const dias = diasEntre(a.fechaInicio, a.fechaFin);
    const tarifa = Number(ad.precioUnitario) * dias;
    agregar(
      a.creadoEn,
      "ALQUILER",
      `Alquilado por ${a.usuario.nombre}`,
      `${cliente}. Del ${fechaCorta(a.fechaInicio)} al ${fechaCorta(a.fechaFin)} (${dias} día${dias === 1 ? "" : "s"}), ` +
        `tarifa de lista ${soles(tarifa)} (${soles(Number(ad.precioUnitario))} por día). ` +
        `Total del alquiler: ${soles(Number(a.montoTotal))}. Estado del alquiler: ${a.estado.toLowerCase()}.`
    );

    const dev = a.devolucion;
    if (!dev) continue;
    agregar(
      dev.fechaDevolucion,
      "DEVOLUCION",
      `Devuelto por ${a.usuario.nombre}`,
      `Devolución ${dev.estado.toLowerCase().replace("_", " ")}. Garantía: ${dev.garantiaEstado.toLowerCase()}${
        dev.garantiaMotivo ? ` (${dev.garantiaMotivo})` : ""
      }.${dev.observaciones ? ` Observaciones: ${dev.observaciones}` : ""}`
    );
    agregar(dev.creadoEn, "DISPONIBILIDAD", "Entra en lavado", "Tras la devolución el disfraz pasa 3 días hábiles en lavado, planchado y empaquetado.");
    const fin = liberacionLavado(dev.creadoEn);
    if (fin <= ahora) agregar(fin, "DISPONIBILIDAD", "Termina el lavado", "El disfraz vuelve a estar disponible para alquilar.");

    for (const dp of dev.prendas) {
      if (dp.estadoPrenda === "BUEN_ESTADO") continue;
      if (dp.prenda.disfrazHogarId !== id && dp.prenda.disfrazActualId !== id) continue;
      const revision = dp.estadoAdmin
        ? ` Revisión del administrador: ${dp.estadoAdmin === "BUEN_ESTADO" ? "buen estado" : dp.estadoAdmin === "DANADA" ? "dañada" : "faltante"}.`
        : " Pendiente de revisión del administrador.";
      agregar(
        dev.creadoEn,
        "INCIDENCIA",
        dp.estadoPrenda === "DANADA" ? "Prenda dañada" : "Prenda faltante",
        `${dp.prenda.nombre}: el cliente la reportó como ${dp.estadoPrenda === "DANADA" ? "dañada" : "faltante"}.${revision}${
          dp.observacion ? ` Observación: ${dp.observacion}` : ""
        }`
      );
    }
  }

  // Préstamos de prendas entre disfraces.
  for (const s of sustituciones) {
    const devuelto = s.motivo.startsWith("Préstamo devuelto");
    if (devuelto) {
      agregar(
        s.fecha,
        "PRESTAMO",
        s.disfrazDestinoId === id ? "Prenda devuelta a este disfraz" : "Prenda devuelta a su disfraz de origen",
        `${s.prenda.nombre} volvió a su lugar. ${s.motivo}.`
      );
    } else if (s.disfrazDestinoId === id) {
      agregar(s.fecha, "PRESTAMO", "Prenda recibida en préstamo", `${s.prenda.nombre} llegó desde «${nombreDe(s.disfrazOrigenId)}». ${s.motivo}.`);
    } else {
      agregar(s.fecha, "PRESTAMO", "Prenda prestada a otro disfraz", `${s.prenda.nombre} pasó a «${nombreDe(s.disfrazDestinoId)}». ${s.motivo}.`);
    }
  }

  // Reservas por ajuste de talla (apartan piezas del disfraz por un tiempo).
  for (const r of reservas) {
    agregar(r.creadoEn, "DISPONIBILIDAD", "Reserva por ajuste de talla", "Un cliente apartó piezas del disfraz para ajustarlas a su talla; mientras dura la reserva no se puede alquilar a otra persona.");
    if (r.confirmadaEn) agregar(r.confirmadaEn, "DISPONIBILIDAD", "Ajuste de talla confirmado", "La reserva se convirtió en un alquiler pagado.");
    else if (r.liberadaEn) agregar(r.liberadaEn, "DISPONIBILIDAD", "Reserva liberada", "La reserva venció o se canceló y el disfraz volvió a estar disponible.");
  }

  eventos.sort((x, y) => x.cuando.getTime() - y.cuando.getTime());

  return {
    disfraz: { id: disfraz.id, nombre: disfraz.nombre, familia: disfraz.familia, tipoDisfraz: disfraz.tipoDisfraz },
    eventos: eventos.map(({ cuando, e }) => ({ fecha: cuando.toISOString(), ...e })) as EventoHistorial[],
  };
}
