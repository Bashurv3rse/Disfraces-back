import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  disfraz: null as any,
  registrados: [] as any[],
  alquileres: [] as any[],
  sustituciones: [] as any[],
  reservas: [] as any[],
  otros: [] as any[],
};

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    disfrazFisico: {
      findUnique: vi.fn(async () => db.disfraz),
      findMany: vi.fn(async () => db.otros),
    },
    eventoDisfraz: { findMany: vi.fn(async () => db.registrados) },
    alquilerDisfraz: { findMany: vi.fn(async () => db.alquileres) },
    sustitucion: { findMany: vi.fn(async () => db.sustituciones) },
    reserva: { findMany: vi.fn(async () => db.reservas) },
  },
}));

import { ErrorHistorial, obtenerHistorialDisfraz } from "../../src/modules/disfraces/historial.service";

const f = (s: string) => new Date(`${s}Z`);
const ID = "d1";

function prepararDatos() {
  db.disfraz = {
    id: ID,
    nombre: "Batman #1",
    familia: "Batman",
    tipoDisfraz: "HEROE",
    temporadaEvento: "Halloween",
    precioAlquiler: "50",
    origen: "CATALOGO",
    creadoEn: f("2026-09-01T10:00:00"),
    prendasHogar: [
      { id: "p1", nombre: "Capa", tipo: "CAPA", color: "negro", talla: "M", creadoEn: f("2026-09-01T10:00:00") },
      { id: "p2", nombre: "Botas", tipo: "ZAPATO", color: "negro", talla: "40", creadoEn: f("2026-09-01T10:00:10") },
      { id: "p3", nombre: "Antifaz", tipo: "ACCESORIO", color: "negro", talla: "única", creadoEn: f("2026-09-20T09:00:00") },
    ],
  };
  db.registrados = [
    { fecha: f("2026-09-05T12:00:00"), tipo: "ESTADO", detalle: "Pasó a reparación" },
    { fecha: f("2026-09-06T12:00:00"), tipo: "PRENDA", detalle: "Se cambió el color de la capa" },
  ];
  const devolucion = (fecha: string, estadoAdmin: string | null, observacion: string | null, estado: string, obs: string | null, motivo: string | null) => ({
    fechaDevolucion: f(fecha),
    creadoEn: f(fecha),
    estado,
    garantiaEstado: "RETENIDA",
    garantiaMotivo: motivo,
    observaciones: obs,
    prendas: [
      { estadoPrenda: "BUEN_ESTADO", estadoAdmin: null, observacion: null, prenda: { nombre: "Capa", disfrazHogarId: ID, disfrazActualId: ID } },
      { estadoPrenda: "DANADA", estadoAdmin, observacion, prenda: { nombre: "Botas", disfrazHogarId: ID, disfrazActualId: ID } },
      { estadoPrenda: "FALTANTE", estadoAdmin: "FALTANTE", observacion: null, prenda: { nombre: "Antifaz", disfrazHogarId: ID, disfrazActualId: ID } },
      { estadoPrenda: "DANADA", estadoAdmin: null, observacion: null, prenda: { nombre: "Ajena", disfrazHogarId: "x", disfrazActualId: "y" } },
    ],
  });
  db.alquileres = [
    {
      precioUnitario: "50",
      alquiler: {
        creadoEn: f("2026-10-01T09:00:00"),
        fechaInicio: f("2026-10-05T00:00:00"),
        fechaFin: f("2026-10-08T00:00:00"),
        montoTotal: "150",
        estado: "FINALIZADO",
        usuario: { nombre: "Ana", email: "ana@x.com" },
        devolucion: devolucion("2026-10-10T15:00:00", "DANADA", "se rompió la suela", "CON_OBSERVACIONES", "Llegó tarde", "Prenda dañada"),
      },
    },
    {
      precioUnitario: "50",
      alquiler: {
        creadoEn: f("2026-11-01T09:00:00"),
        fechaInicio: f("2026-11-30T00:00:00"),
        fechaFin: f("2026-11-30T00:00:00"),
        montoTotal: "50",
        estado: "ACTIVO",
        usuario: { nombre: "Luis", email: "luis@x.com" },
        devolucion: null,
      },
    },
    {
      precioUnitario: "50",
      alquiler: {
        creadoEn: f("2027-01-04T09:00:00"),
        fechaInicio: f("2027-01-10T00:00:00"),
        fechaFin: f("2027-01-12T00:00:00"),
        montoTotal: "100",
        estado: "FINALIZADO",
        usuario: { nombre: "Eva", email: "eva@x.com" },
        devolucion: devolucion("2027-01-12T15:00:00", "BUEN_ESTADO", null, "COMPLETA", null, null),
      },
    },
  ];
  db.sustituciones = [
    { fecha: f("2026-10-20T10:00:00"), motivo: "Préstamo devuelto por arreglo", disfrazOrigenId: "o1", disfrazDestinoId: ID, prenda: { nombre: "Capa" } },
    { fecha: f("2026-10-21T10:00:00"), motivo: "Préstamo devuelto por arreglo", disfrazOrigenId: ID, disfrazDestinoId: "o1", prenda: { nombre: "Capa" } },
    { fecha: f("2026-10-22T10:00:00"), motivo: "Falta de pieza", disfrazOrigenId: "o1", disfrazDestinoId: ID, prenda: { nombre: "Botas" } },
    { fecha: f("2026-10-23T10:00:00"), motivo: "Falta de pieza", disfrazOrigenId: ID, disfrazDestinoId: "o2", prenda: { nombre: "Botas" } },
  ];
  db.otros = [{ id: "o1", nombre: "Superman #3" }];
  db.reservas = [
    { creadoEn: f("2026-10-25T10:00:00"), confirmadaEn: f("2026-10-25T10:05:00"), liberadaEn: null },
    { creadoEn: f("2026-10-26T10:00:00"), confirmadaEn: null, liberadaEn: f("2026-10-26T10:20:00") },
    { creadoEn: f("2026-10-27T10:00:00"), confirmadaEn: null, liberadaEn: null },
  ];
}

describe("historial del disfraz: línea de tiempo (PF-HIS)", () => {
  beforeEach(() => {
    prepararDatos();
    vi.useFakeTimers();
    vi.setSystemTime(f("2026-12-01T12:00:00"));
  });

  it("devuelve null si el disfraz no existe", async () => {
    db.disfraz = null;
    expect(await obtenerHistorialDisfraz(ID)).toBeNull();
  });

  it("rechaza los disfraces que no son del catálogo", async () => {
    db.disfraz = { ...db.disfraz, origen: "A_MEDIDA" };
    await expect(obtenerHistorialDisfraz(ID)).rejects.toBeInstanceOf(ErrorHistorial);
  });

  it("arma la línea de tiempo completa, ordenada por fecha", async () => {
    const r = await obtenerHistorialDisfraz(ID);
    const fechas = r!.eventos.map((e) => e.fecha);
    expect([...fechas].sort()).toEqual(fechas);
    expect(r).toMatchSnapshot();
  });

  it("cubre todas las categorías de evento", async () => {
    const r = await obtenerHistorialDisfraz(ID);
    const categorias = new Set(r!.eventos.map((e) => e.categoria));
    for (const c of ["REGISTRO", "PRENDA", "ESTADO", "ALQUILER", "DEVOLUCION", "INCIDENCIA", "DISPONIBILIDAD", "PRESTAMO"]) {
      expect(categorias.has(c as never)).toBe(true);
    }
  });

  it("no cuenta la prenda de otro disfraz ni las que llegaron en buen estado", async () => {
    const r = await obtenerHistorialDisfraz(ID);
    const incidencias = r!.eventos.filter((e) => e.categoria === "INCIDENCIA");
    expect(incidencias.some((e) => e.detalle.startsWith("Ajena"))).toBe(false);
    expect(incidencias.some((e) => e.detalle.startsWith("Capa"))).toBe(false);
  });

  it("solo muestra «Termina el lavado» cuando ya pasó", async () => {
    const r = await obtenerHistorialDisfraz(ID);
    const fines = r!.eventos.filter((e) => e.titulo === "Termina el lavado");
    expect(fines).toHaveLength(1); // la devolución de enero 2027 aún no termina su lavado
  });

  it("singulariza «1 prenda» y «1 día»", async () => {
    db.disfraz.prendasHogar = [db.disfraz.prendasHogar[0]];
    const r = await obtenerHistorialDisfraz(ID);
    const alta = r!.eventos.find((e) => e.categoria === "REGISTRO")!;
    expect(alta.detalle).toContain("con 1 prenda:");
    const alq = r!.eventos.find((e) => e.titulo === "Alquilado por Luis")!;
    expect(alq.detalle).toContain("(1 día)");
  });
});
