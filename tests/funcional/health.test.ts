import { afterEach, describe, expect, it, vi } from "vitest";
import { comprobarBaseDeDatos, crearManejadorListo } from "../../src/common/health";

function respuesta() {
  const res: any = { codigo: 0, cuerpo: null };
  res.status = (c: number) => {
    res.codigo = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.cuerpo = b;
    return res;
  };
  return res;
}

describe("comprobación de disponibilidad (PF-HEALTH)", () => {
  afterEach(() => vi.useRealTimers());

  it("la base responde: ok", async () => {
    const r = await comprobarBaseDeDatos({ $queryRaw: async () => [{ "?column?": 1 }] });
    expect(r.ok).toBe(true);
  });

  it("la base lanza error: no ok y no lanza", async () => {
    const r = await comprobarBaseDeDatos({ $queryRaw: async () => Promise.reject(new Error("ECONNREFUSED")) });
    expect(r.ok).toBe(false);
  });

  it("la base no responde a tiempo: no ok", async () => {
    vi.useFakeTimers();
    const pendiente = comprobarBaseDeDatos({ $queryRaw: () => new Promise(() => {}) }, 500);
    await vi.advanceTimersByTimeAsync(600);
    expect((await pendiente).ok).toBe(false);
  });

  it("/health/ready devuelve 200 cuando la base está bien", async () => {
    const res = respuesta();
    await crearManejadorListo({ $queryRaw: async () => [] })({} as any, res);
    expect(res.codigo).toBe(200);
    expect(res.cuerpo).toMatchObject({ status: "ok", db: "ok" });
  });

  it("/health/ready devuelve 503 cuando la base falla y no filtra el error", async () => {
    const res = respuesta();
    await crearManejadorListo({ $queryRaw: async () => Promise.reject(new Error("password authentication failed")) })({} as any, res);
    expect(res.codigo).toBe(503);
    expect(res.cuerpo).toMatchObject({ status: "degradado", db: "error" });
    expect(JSON.stringify(res.cuerpo)).not.toContain("password");
  });
});
