import { expect, it } from "vitest";
import { recetaSchema } from "../../src/modules/recetas/recetas.schema";
import { crearDisfrazSchema } from "../../src/modules/disfraces/disfraces.schema";

// Orden de la primera hoja de la RTM. Solo Zod: sin API, Prisma ni variables .env.
it("TC-BE-REC-02: rechaza recetas sin piezas o con datos inválidos", () => {
  const pieza = { etiqueta: "Camisa", tipo: "CAMISA", obligatoria: true };
  const valida = { nombre: "Marinera", palabrasClave: ["marinera"], precioDia: 40, piezas: [pieza] };
  const invalidas: { caso: string; datos: unknown; campo: string }[] = [
    { caso: "sin piezas", datos: { ...valida, piezas: [] }, campo: "piezas" },
    { caso: "piezas omitidas", datos: { ...valida, piezas: undefined }, campo: "piezas" },
    { caso: "más de doce piezas", datos: { ...valida, piezas: Array(13).fill(pieza) }, campo: "piezas" },
    { caso: "todas opcionales", datos: { ...valida, piezas: [{ ...pieza, obligatoria: false }] }, campo: "piezas" },
    { caso: "tipo inexistente", datos: { ...valida, piezas: [{ ...pieza, tipo: "TIPO_INEXISTENTE" }] }, campo: "piezas.0.tipo" },
    { caso: "etiqueta vacía", datos: { ...valida, piezas: [{ ...pieza, etiqueta: "  " }] }, campo: "piezas.0.etiqueta" },
    { caso: "nombre vacío", datos: { ...valida, nombre: "  " }, campo: "nombre" },
    { caso: "sin palabras clave", datos: { ...valida, palabrasClave: [] }, campo: "palabrasClave" },
    ...[0, -1, 100001, "40"].map(precioDia => ({
      caso: `precio inválido ${precioDia}`, datos: { ...valida, precioDia }, campo: "precioDia",
    })),
  ];
  for (const { caso, datos, campo } of invalidas) {
    const resultado = recetaSchema.safeParse(datos);
    expect(resultado.success, caso).toBe(false);
    if (resultado.success) throw new Error(`Se aceptó una receta inválida: ${caso}`);
    expect(resultado.error.issues.map(issue => issue.path.join(".")), caso).toContain(campo);
  }
  // Controles positivos y fronteras: mínimo/máximo de piezas y precio máximo.
  for (const cantidad of [1, 12]) {
    const resultado = recetaSchema.safeParse({ ...valida, precioDia: 100000, piezas: Array(cantidad).fill(pieza) });
    expect(resultado.success, `${cantidad} piezas válidas`).toBe(true);
  }
  const resultado = recetaSchema.parse({ ...valida, piezas: [{ etiqueta: "Camisa", tipo: "CAMISA" }] });
  expect(resultado.activa).toBe(true);
  expect(resultado.piezas[0].obligatoria).toBe(true);
});

it("TC-BE-ADM-02: rechaza disfraces sin prendas o con datos inválidos", () => {
  const prenda = { nombre: "Camisa", tipo: "CAMISA", color: "Blanco", talla: "M" };
  const valido = { nombre: "Marinera", tipoDisfraz: "Tradicional", temporadaEvento: "Fiestas", precioAlquiler: 40, prendas: [prenda] };
  const invalidos: { caso: string; datos: unknown; campo: string }[] = [
    { caso: "sin prendas", datos: { ...valido, prendas: [] }, campo: "prendas" },
    { caso: "prendas omitidas", datos: { ...valido, prendas: undefined }, campo: "prendas" },
    { caso: "más de veinte prendas", datos: { ...valido, prendas: Array(21).fill(prenda) }, campo: "prendas" },
    { caso: "tipo de prenda inexistente", datos: { ...valido, prendas: [{ ...prenda, tipo: "TIPO_INEXISTENTE" }] }, campo: "prendas.0.tipo" },
    ...["nombre", "color", "talla"].map(campo => ({
      caso: `prenda sin ${campo}`, datos: { ...valido, prendas: [{ ...prenda, [campo]: "  " }] }, campo: `prendas.0.${campo}`,
    })),
    ...["nombre", "tipoDisfraz", "temporadaEvento"].map(campo => ({
      caso: `disfraz sin ${campo}`, datos: { ...valido, [campo]: "  " }, campo,
    })),
    ...[0, -1, 100001, "40"].map(precioAlquiler => ({
      caso: `precio inválido ${precioAlquiler}`, datos: { ...valido, precioAlquiler }, campo: "precioAlquiler",
    })),
  ];
  for (const { caso, datos, campo } of invalidos) {
    const resultado = crearDisfrazSchema.safeParse(datos);
    expect(resultado.success, caso).toBe(false);
    if (resultado.success) throw new Error(`Se aceptó un disfraz inválido: ${caso}`);
    expect(resultado.error.issues.map(issue => issue.path.join(".")), caso).toContain(campo);
  }
  for (const cantidad of [1, 20]) {
    const resultado = crearDisfrazSchema.safeParse({ ...valido, precioAlquiler: 100000, prendas: Array(cantidad).fill(prenda) });
    expect(resultado.success, `${cantidad} prendas válidas`).toBe(true);
  }
  // tipoDisfraz es texto libre; el enum cerrado corresponde al tipo de cada prenda.
  expect(crearDisfrazSchema.parse(valido).temporadaEvento).toBe("fiestas");
});
