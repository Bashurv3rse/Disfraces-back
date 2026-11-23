import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================
// PRUEBA DE ARQUITECTURA (fitness function)
//
// Protege el aislamiento de la pasarela de pagos: si alguien vuelve a importar Stripe en un
// servicio de negocio, esta prueba falla en la CI (equivalente a una regla de ArchUnit/JDepend).
// ============================================================

const RAIZ = join(__dirname, "..", "..", "src");

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    return ruta.endsWith(".ts") ? [ruta] : [];
  });
}

const fuentes = archivosTs(RAIZ).map((ruta) => ({
  ruta: relative(RAIZ, ruta).split(sep).join("/"),
  codigo: readFileSync(ruta, "utf-8"),
}));

const importa = (codigo: string, modulo: string) =>
  new RegExp(`(from|require\\()\\s*["']${modulo}["']`).test(codigo);

describe("Arquitectura: la pasarela de pagos está aislada", () => {
  it("solo el adaptador importa el SDK de Stripe", () => {
    const conStripe = fuentes.filter((f) => importa(f.codigo, "stripe")).map((f) => f.ruta);
    expect(conStripe).toEqual(["modules/pagos/stripe.pasarela.ts"]);
  });

  it("el puerto no depende de ninguna implementación", () => {
    const puerto = fuentes.find((f) => f.ruta === "modules/pagos/pasarela-pago.ts")!;
    expect(puerto.codigo).not.toMatch(/from\s+["'][^"']*(stripe|prisma)/);
  });

  it("los servicios de negocio dependen del puerto, no del adaptador concreto", () => {
    const servicios = fuentes.filter((f) => f.ruta.endsWith(".service.ts"));
    const usanAdaptador = servicios.filter((f) => /stripe\.pasarela/.test(f.codigo)).map((f) => f.ruta);
    expect(usanAdaptador).toEqual([]);
  });

  it("los servicios que cobran o reembolsan obtienen la pasarela desde la raíz de composición", () => {
    for (const ruta of ["modules/pagos/pagos.service.ts", "modules/devoluciones/garantia.service.ts"]) {
      const f = fuentes.find((x) => x.ruta === ruta)!;
      expect(f.codigo, ruta).toMatch(/pasarela\.config/);
      expect(f.codigo, ruta).not.toMatch(/new Stripe\(/);
    }
  });
});
