export type CategoriaTalla = "ROPA" | "CALZADO" | "UNICA";

export const TALLAS_ROPA = ["XS", "S", "M", "L", "XL", "XXL"];
export const TALLAS_CALZADO = Array.from({ length: 13 }, (_, i) => String(34 + i)); // 34 … 46
export const TALLA_UNICA = "única";

export function categoriaTalla(tipo: string): CategoriaTalla {
  if (tipo === "ZAPATO" || tipo === "TACON") return "CALZADO";
  if (tipo === "PANUELO" || tipo === "ACCESORIO") return "UNICA";
  return "ROPA";
}

export function tallasPermitidas(tipo: string): string[] {
  switch (categoriaTalla(tipo)) {
    case "CALZADO":
      return TALLAS_CALZADO;
    case "UNICA":
      return [TALLA_UNICA];
    default:
      return TALLAS_ROPA;
  }
}

// Acepta «m», «unica», etc. y lo deja en el formato guardado.
export function normalizarTalla(tipo: string, talla: string): string {
  const limpia = talla.trim();
  switch (categoriaTalla(tipo)) {
    case "UNICA":
      return /^[uú]nica$/i.test(limpia) ? TALLA_UNICA : limpia;
    case "ROPA":
      return limpia.toUpperCase();
    default:
      return limpia;
  }
}

export function tallaValida(tipo: string, talla: string): boolean {
  return tallasPermitidas(tipo).includes(talla);
}

export function ordenTalla(tipo: string, talla: string): number {
  const i = tallasPermitidas(tipo).indexOf(talla);
  return i === -1 ? 999 : i;
}