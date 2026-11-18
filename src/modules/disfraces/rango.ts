export interface RangoFechas {
  inicio: Date;
  fin: Date;
}

// Convierte las fechas que llegan como texto en un rango; si no se pueden leer devuelve
// undefined y quien llama conserva la regla de «alquilado ahora».
export function rangoDesdeTexto(inicio: string, fin: string): RangoFechas | undefined {
  const i = new Date(inicio);
  const f = new Date(fin);
  if (Number.isNaN(i.getTime()) || Number.isNaN(f.getTime()) || f < i) return undefined;
  return { inicio: i, fin: f };
}
