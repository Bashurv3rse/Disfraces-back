import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    reserva: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), delete: vi.fn() },
    movimientoPrenda: { findMany: vi.fn() },
    prenda: { updateMany: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    alquilerDisfraz: { count: vi.fn() }, disfrazFisico: { delete: vi.fn() },
  };
  return { tx, reserva: { findMany: vi.fn() }, transaction: vi.fn() };
});
vi.mock("../../src/config/prisma", () => ({ prisma: {
  reserva: mocks.reserva, $transaction: mocks.transaction,
} }));
import { deshacerMovimientos, desarmarReservasTerminadas, liberarReservasVencidas,
  liberarSinConfirmar, obtenerReservadosIds } from "../../src/modules/a-medida/reservas.base";

describe("Reservas base: liberación, anomalías y recuperación", () => {
  const tx = mocks.tx as unknown as Parameters<typeof deshacerMovimientos>[0];
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async fn => fn(mocks.tx));
    mocks.reserva.findMany.mockResolvedValue([]);
    mocks.tx.reserva.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.reserva.findUniqueOrThrow.mockResolvedValue({ disfrazFisicoId: "temporal", disfrazFisico: { origen: "A_MEDIDA" } });
    mocks.tx.movimientoPrenda.findMany.mockResolvedValue([]);
    mocks.tx.prenda.count.mockResolvedValue(0);
    mocks.tx.prenda.findMany.mockResolvedValue([]);
    mocks.tx.alquilerDisfraz.count.mockResolvedValue(0);
  });

  it("incluye donantes de ajustes y excluye el disfraz ajustado y al propietario solicitado", async () => {
    mocks.reserva.findMany.mockResolvedValueOnce([{ disfrazFisicoId: "reservado" }]).mockResolvedValueOnce([
      { disfrazFisicoId: "ajustado", movimientos: [{ desdeId: "donante", haciaId: "ajustado" }, { desdeId: "ajustado", haciaId: "donante" }] },
    ]);
    expect(await obtenerReservadosIds("usuario")).toEqual(new Set(["reservado", "donante"]));
    expect(mocks.reserva.findMany.mock.calls[0][0].where.usuarioId).toEqual({ not: "usuario" });
  });

  it("sin propietario devuelve conjunto vacío y no agrega filtro de usuario", async () => {
    expect(await obtenerReservadosIds()).toEqual(new Set());
    expect(mocks.reserva.findMany.mock.calls[0][0].where).not.toHaveProperty("usuarioId");
  });

  it("restaura movimientos en orden inverso y omite piezas que cambiaron de ubicación", async () => {
    mocks.tx.movimientoPrenda.findMany.mockResolvedValue([
      { prendaId: "p2", desdeId: "b", haciaId: "c" }, { prendaId: "p1", desdeId: "a", haciaId: "b" },
    ]);
    mocks.tx.prenda.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await deshacerMovimientos(tx, "r")).toEqual({ restauradas: 1, omitidas: 1 });
    expect(mocks.tx.movimientoPrenda.findMany).toHaveBeenCalledWith({ where: { reservaId: "r" }, orderBy: { orden: "desc" } });
    expect(mocks.tx.prenda.updateMany.mock.calls).toEqual([
      [{ where: { id: "p2", disfrazActualId: "c" }, data: { disfrazActualId: "b" } }],
      [{ where: { id: "p1", disfrazActualId: "b" }, data: { disfrazActualId: "a" } }],
    ]);
  });

  it("no libera de nuevo una reserva ya reclamada y respeta el propietario", async () => {
    mocks.tx.reserva.updateMany.mockResolvedValue({ count: 0 });
    expect(await liberarSinConfirmar("r", "usuario")).toBe(false);
    expect(mocks.tx.reserva.updateMany.mock.calls[0][0].where).toMatchObject({ id: "r", usuarioId: "usuario", confirmadaEn: null });
    expect(mocks.tx.reserva.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.tx.reserva.delete).not.toHaveBeenCalled();
  });

  it("elimina reserva y disfraz temporal vacío al liberar sin anomalías", async () => {
    expect(await liberarSinConfirmar("r")).toBe(true);
    expect(mocks.tx.reserva.delete).toHaveBeenCalledWith({ where: { id: "r" } });
    expect(mocks.tx.disfrazFisico.delete).toHaveBeenCalledWith({ where: { id: "temporal" } });
  });

  it("libera ajuste de catálogo conservando el disfraz y sin contar piezas temporales", async () => {
    mocks.tx.reserva.findUniqueOrThrow.mockResolvedValue({ disfrazFisicoId: "catalogo", disfrazFisico: { origen: "CATALOGO" } });
    expect(await liberarSinConfirmar("r")).toBe(true);
    expect(mocks.tx.reserva.delete).toHaveBeenCalled();
    expect(mocks.tx.disfrazFisico.delete).not.toHaveBeenCalled();
    expect(mocks.tx.prenda.count).not.toHaveBeenCalled();
    expect(mocks.tx.alquilerDisfraz.count).not.toHaveBeenCalled();
  });

  it.each(["movimiento omitido", "pieza restante", "historial de alquiler"])("conserva el rastro ante %s", async motivo => {
    if (motivo === "movimiento omitido") {
      mocks.tx.movimientoPrenda.findMany.mockResolvedValue([{ prendaId: "p", desdeId: "a", haciaId: "b" }]);
      mocks.tx.prenda.updateMany.mockResolvedValue({ count: 0 });
    } else if (motivo === "pieza restante") mocks.tx.prenda.count.mockResolvedValue(1);
    else mocks.tx.alquilerDisfraz.count.mockResolvedValue(1);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await liberarSinConfirmar("r")).toBe(true);
      expect(JSON.parse(aviso.mock.calls[0][0])).toMatchObject({ evento: "RESERVA_LIBERADA_CON_ANOMALIA", reservaId: "r" });
      expect(mocks.tx.reserva.delete).not.toHaveBeenCalled();
      expect(mocks.tx.disfrazFisico.delete).not.toHaveBeenCalled();
    } finally { aviso.mockRestore(); }
  });

  it("informa fallo transaccional sin fingir liberación correcta", async () => {
    mocks.transaction.mockRejectedValue(new Error("transacción fallida"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await liberarSinConfirmar("r")).toBe(false);
      expect(error).toHaveBeenCalled();
      expect(mocks.tx.reserva.delete).not.toHaveBeenCalled();
    } finally { error.mockRestore(); }
  });

  it("cuenta solo reservas vencidas que logra reclamar", async () => {
    mocks.reserva.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    mocks.tx.reserva.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await liberarReservasVencidas()).toBe(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.reserva.findMany.mock.calls[0][0].where.vence.lte).toBeInstanceOf(Date);
  });

  it("desarma una confirmada, conserva historial y no cuenta otra ya reclamada", async () => {
    mocks.reserva.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    mocks.tx.reserva.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mocks.tx.reserva.findUniqueOrThrow.mockResolvedValue({ disfrazFisicoId: "catalogo", disfrazFisico: { origen: "CATALOGO" } });
    expect(await desarmarReservasTerminadas()).toBe(1);
    expect(mocks.tx.reserva.delete).not.toHaveBeenCalled();
    expect(mocks.tx.prenda.findMany).not.toHaveBeenCalled();
  });

  it("rescata piezas de un disfraz a medida y audita la anomalía sin borrar historial", async () => {
    mocks.reserva.findMany.mockResolvedValue([{ id: "r" }]);
    mocks.tx.prenda.findMany.mockResolvedValue([{ id: "p", disfrazHogarId: "hogar" }]);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await desarmarReservasTerminadas()).toBe(1);
      expect(mocks.tx.prenda.update).toHaveBeenCalledWith({ where: { id: "p" }, data: { disfrazActualId: "hogar" } });
      expect(JSON.parse(aviso.mock.calls[0][0])).toMatchObject({ evento: "DESARMADO_CON_ANOMALIA", rescatadas: 1 });
      expect(mocks.tx.reserva.delete).not.toHaveBeenCalled();
    } finally { aviso.mockRestore(); }
  });

  it("continúa con la siguiente reserva si falla una transacción de desarmado", async () => {
    mocks.reserva.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    mocks.transaction.mockRejectedValueOnce(new Error("conflicto"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await desarmarReservasTerminadas()).toBe(1);
      expect(error).toHaveBeenCalledTimes(1);
      expect(mocks.tx.reserva.updateMany.mock.calls[0][0].where.id).toBe("r2");
    } finally { error.mockRestore(); }
  });
});
