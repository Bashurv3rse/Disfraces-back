import type { Request, Response } from "express";

// Lo mínimo que necesitamos de la base de datos: así la comprobación se puede probar sin Prisma.
export interface BaseSondeable {
  $queryRaw: (consulta: TemplateStringsArray) => Promise<unknown>;
}

export interface ResultadoBase {
  ok: boolean;
  latenciaMs: number;
}

// Hace un SELECT 1 con tiempo máximo. Nunca lanza: devuelve ok=false si falla o se demora.
export async function comprobarBaseDeDatos(db: BaseSondeable, tiempoMaxMs = 2000): Promise<ResultadoBase> {
  const inicio = Date.now();
  let temporizador: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error("tiempo agotado")), tiempoMaxMs);
      }),
    ]);
    return { ok: true, latenciaMs: Date.now() - inicio };
  } catch {
    return { ok: false, latenciaMs: Date.now() - inicio };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

// /health responde "el proceso está vivo" (liveness, ya existía).
// /health/ready responde "puede atender pedidos": además comprueba que la base responda (readiness).
// Un balanceador o un monitor externo debe usar /health/ready para sacar de rotación una réplica sin BD.
export function crearManejadorListo(db: BaseSondeable, tiempoMaxMs = 2000) {
  return async (_req: Request, res: Response) => {
    const base = await comprobarBaseDeDatos(db, tiempoMaxMs);
    const cuerpo = {
      status: base.ok ? "ok" : "degradado",
      service: "disfraces-alquiler-backend",
      db: base.ok ? "ok" : "error",
      dbLatenciaMs: base.latenciaMs,
      uptimeSegundos: Math.round(process.uptime()),
    };
    res.status(base.ok ? 200 : 503).json(cuerpo);
  };
}
