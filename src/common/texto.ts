// Normaliza texto para comparar: minúsculas, sin tildes ni signos y con espacios simples.
// «Pañuelo» y «panuelo» quedan iguales.
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}