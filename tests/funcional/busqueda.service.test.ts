import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// MOCKS
// ============================================================

vi.mock("../../src/config/prisma", () => ({
  prisma: {
    receta: {
      findMany: vi.fn(),
    },

    disfrazFisico: {
      findMany: vi.fn(),
    },

    peticionDisfraz: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock(
  "../../src/modules/disfraces/disfraces.service",
  () => ({
    estadosDeDisfraces: vi.fn(),
  })
);

// ============================================================
// IMPORTS
// ============================================================

import { prisma } from "../../src/config/prisma";

import { estadosDeDisfraces } from "../../src/modules/disfraces/disfraces.service";

import {
  ErrorBusqueda,
  palabrasSignificativas,
  distancia,
  puntuar,
  listarRecetasPublicas,
  buscarRecetas,
} from "../../src/modules/a-medida/busqueda.service";

// ============================================================
// HELPERS
// ============================================================

function pieza(
  overrides: Record<string, any> = {}
) {
  return {
    id: "pieza-1",
    etiqueta: "Camisa roja",
    tipo: "CAMISA",
    obligatoria: true,
    ...overrides,
  };
}

function receta(
  overrides: Record<string, any> = {}
) {
  return {
    id: "receta-1",
    nombre: "Bombero",
    descripcion: "Disfraz de bombero",
    precioDia: 50,
    activa: true,
    palabrasClave: [
      "bombero",
      "bomberos",
      "bomberito",
    ],
    piezas: [pieza()],
    ...overrides,
  };
}

function configurarPeticionNueva() {
  vi.mocked(
    prisma.peticionDisfraz.findFirst
  ).mockResolvedValue(null);

  vi.mocked(
    prisma.peticionDisfraz.create
  ).mockResolvedValue({
    id: "peticion-1",
  } as any);
}

function configurarCatalogoVacio() {
  vi.mocked(
    prisma.disfrazFisico.findMany
  ).mockResolvedValue([] as any);

  vi.mocked(
    estadosDeDisfraces
  ).mockResolvedValue([] as any);
}

// ============================================================
// TESTS
// ============================================================

describe(
  "BusquedaService - búsqueda inteligente de disfraces",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        prisma.receta.findMany
      ).mockResolvedValue([] as any);

      configurarPeticionNueva();
      configurarCatalogoVacio();
    });

    // ========================================================
    // PALABRAS SIGNIFICATIVAS
    // ========================================================

    it(
      "PF-BUS-01: elimina palabras vacías de una búsqueda",
      () => {
        const resultado =
          palabrasSignificativas(
            "quiero un disfraz de bombero por favor"
          );

        expect(resultado).toEqual([
          "bombero",
        ]);
      }
    );

    it(
      "PF-BUS-02: conserva varias palabras significativas",
      () => {
        const resultado =
          palabrasSignificativas(
            "quiero pirata rojo con sombrero"
          );

        expect(resultado).toEqual([
          "pirata",
          "rojo",
          "sombrero",
        ]);
      }
    );

    // ========================================================
    // DISTANCIA DE LEVENSHTEIN
    // ========================================================

    it(
      "PF-BUS-03: la distancia entre palabras iguales es cero",
      () => {
        expect(
          distancia("bombero", "bombero")
        ).toBe(0);
      }
    );

    it(
      "PF-BUS-04: calcula la distancia cuando la primera palabra está vacía",
      () => {
        expect(
          distancia("", "capa")
        ).toBe(4);
      }
    );

    it(
      "PF-BUS-05: calcula la distancia cuando la segunda palabra está vacía",
      () => {
        expect(
          distancia("capa", "")
        ).toBe(4);
      }
    );

    it(
      "PF-BUS-06: calcula sustituciones, inserciones y eliminaciones",
      () => {
        expect(
          distancia("gato", "pato")
        ).toBe(1);

        expect(
          distancia("capa", "capas")
        ).toBe(1);

        expect(
          distancia("capas", "capa")
        ).toBe(1);
      }
    );

    // ========================================================
    // PUNTUACIÓN
    // ========================================================

    it(
      "PF-BUS-07: asigna 100 puntos a una palabra clave exacta",
      () => {
        const resultado = puntuar(
          "quiero bombero",
          ["bombero"],
          ["bombero"]
        );

        expect(resultado).toBe(100);
      }
    );

    it(
      "PF-BUS-08: asigna 100 puntos cuando coincide una frase clave completa",
      () => {
        const resultado = puntuar(
          "quiero caperucita roja",
          ["caperucita", "roja"],
          ["caperucita roja"]
        );

        expect(resultado).toBe(100);
      }
    );

    it(
      "PF-BUS-09: una frase clave no puntúa si no aparece completa",
      () => {
        const resultado = puntuar(
          "quiero caperucita azul",
          ["caperucita", "azul"],
          ["caperucita roja"]
        );

        expect(resultado).toBe(0);
      }
    );

    it(
      "PF-BUS-10: tolera un error de tipeo en palabras de longitud media",
      () => {
        const resultado = puntuar(
          "bomber",
          ["bomber"],
          ["bombero"]
        );

        expect(resultado).toBe(70);
      }
    );

    it(
      "PF-BUS-11: tolera hasta dos errores en palabras largas",
      () => {
        const resultado = puntuar(
          "superheroe",
          ["superheroe"],
          ["superheroa"]
        );

        expect(resultado).toBeGreaterThanOrEqual(
          60
        );
      }
    );

    it(
      "PF-BUS-12: no aplica coincidencia aproximada a palabras demasiado cortas",
      () => {
        const resultado = puntuar(
          "sol",
          ["sol"],
          ["sal"]
        );

        expect(resultado).toBe(0);
      }
    );

    it(
      "PF-BUS-13: ignora palabras clave vacías después de normalizarlas",
      () => {
        const resultado = puntuar(
          "bombero",
          ["bombero"],
          ["", "bombero"]
        );

        expect(resultado).toBe(100);
      }
    );

    // ========================================================
    // RECETAS PÚBLICAS
    // ========================================================

    it(
      "PF-BUS-14: lista únicamente las recetas activas mediante la consulta esperada",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta(),
        ] as any);

        const resultado =
          await listarRecetasPublicas();

        expect(
          prisma.receta.findMany
        ).toHaveBeenCalledWith({
          where: {
            activa: true,
          },

          include: {
            piezas: true,
          },

          orderBy: {
            nombre: "asc",
          },
        });

        expect(resultado).toHaveLength(1);
        expect(resultado[0].nombre).toBe(
          "Bombero"
        );
      }
    );

    it(
      "PF-BUS-15: transforma precio y piezas al formato público",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta({
            precioDia: "59.90",

            piezas: [
              pieza({
                id: "zapato-1",
                etiqueta: "Zapatos",
                tipo: "ZAPATO",
              }),

              pieza({
                id: "camisa-1",
                etiqueta: "Camisa",
                tipo: "CAMISA",
              }),
            ],
          }),
        ] as any);

        const [resultado] =
          await listarRecetasPublicas();

        expect(resultado.precioDia).toBe(
          59.9
        );

        expect(
          resultado.piezas.map(
            (p) => p.tipo
          )
        ).toEqual([
          "CAMISA",
          "ZAPATO",
        ]);
      }
    );

    it(
      "PF-BUS-16: indica cuándo una receta necesita talla de ropa",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta({
            piezas: [
              pieza({
                tipo: "CAMISA",
              }),
            ],
          }),
        ] as any);

        const [resultado] =
          await listarRecetasPublicas();

        expect(
          resultado.pideTallaRopa
        ).toBe(true);

        expect(
          resultado.pideTallaCalzado
        ).toBe(false);
      }
    );

    it(
      "PF-BUS-17: indica cuándo una receta necesita talla de calzado",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta({
            piezas: [
              pieza({
                tipo: "ZAPATO",
              }),
            ],
          }),
        ] as any);

        const [resultado] =
          await listarRecetasPublicas();

        expect(
          resultado.pideTallaCalzado
        ).toBe(true);
      }
    );

    // ========================================================
    // BUSCAR RECETAS
    // ========================================================

    it(
      "PF-BUS-18: rechaza una búsqueda formada únicamente por palabras vacías",
      async () => {
        await expect(
          buscarRecetas(
            "usuario-1",
            "quiero un disfraz por favor"
          )
        ).rejects.toBeInstanceOf(
          ErrorBusqueda
        );

        await expect(
          buscarRecetas(
            "usuario-1",
            "quiero un disfraz por favor"
          )
        ).rejects.toThrow(
          "Escribe qué disfraz quieres"
        );

        expect(
          prisma.receta.findMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-BUS-19: devuelve EXACTA cuando encuentra una receta con coincidencia completa",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta(),
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "quiero un disfraz de bombero"
          );

        expect(resultado.resultado).toBe(
          "EXACTA"
        );

        expect(resultado.recetas).toHaveLength(
          1
        );

        expect(
          resultado.recetas[0].nombre
        ).toBe("Bombero");

        expect(resultado.mensaje).toBe(
          "Podemos armar un disfraz de «Bombero»."
        );
      }
    );

    it(
      "PF-BUS-20: devuelve varias opciones cuando existen varias coincidencias exactas",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta({
            id: "r1",
            nombre: "Bombero clásico",
            palabrasClave: ["bombero"],
          }),

          receta({
            id: "r2",
            nombre: "Bombero infantil",
            palabrasClave: ["bombero"],
          }),
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(resultado.resultado).toBe(
          "EXACTA"
        );

        expect(resultado.recetas).toHaveLength(
          2
        );

        expect(resultado.mensaje).toContain(
          "Encontramos varias opciones"
        );
      }
    );

    it(
      "PF-BUS-21: limita las coincidencias exactas a tres recetas",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue(
          [
            "A",
            "B",
            "C",
            "D",
          ].map((nombre, index) =>
            receta({
              id: `r${index}`,
              nombre,
              palabrasClave: [
                "bombero",
              ],
            })
          ) as any
        );

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(resultado.recetas).toHaveLength(
          3
        );
      }
    );

    it(
      "PF-BUS-22: devuelve PARECIDA ante un error de tipeo tolerable",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta(),
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bomber"
          );

        expect(resultado.resultado).toBe(
          "PARECIDA"
        );

        expect(resultado.recetas).toHaveLength(
          1
        );

        expect(resultado.mensaje).toContain(
          "quizá quisiste decir"
        );
      }
    );

    it(
      "PF-BUS-23: ordena coincidencias parecidas por mayor puntaje",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta({
            id: "menos",
            nombre: "Opción menos cercana",
            palabrasClave: ["bombar"],
          }),

          receta({
            id: "mas",
            nombre: "Opción más cercana",
            palabrasClave: ["bombero"],
          }),
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bomber"
          );

        expect(
          resultado.recetas[0].id
        ).toBe("mas");
      }
    );

    it(
      "PF-BUS-24: devuelve SIN_RECETA y ofrece hasta seis recetas cuando no existe coincidencia",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue(
          Array.from(
            { length: 8 },
            (_, index) =>
              receta({
                id: `r${index + 1}`,
                nombre: `Receta ${index + 1}`,
                palabrasClave: [
                  `opcion${index + 1}`,
                ],
              })
          ) as any
        );

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "astronauta"
          );

        expect(resultado.resultado).toBe(
          "SIN_RECETA"
        );

        expect(resultado.recetas).toHaveLength(
          6
        );

        expect(resultado.mensaje).toContain(
          "estos disfraces a medida sí están disponibles"
        );
      }
    );

    it(
      "PF-BUS-25: devuelve mensaje de SIN_RECETA sin alternativas cuando no existen recetas activas",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "astronauta"
          );

        expect(resultado.resultado).toBe(
          "SIN_RECETA"
        );

        expect(resultado.recetas).toEqual(
          []
        );

        expect(resultado.mensaje).toBe(
          "Todavía no podemos armar un disfraz de «astronauta». Ya registramos tu pedido para que la tienda lo considere."
        );
      }
    );

    it(
      "PF-BUS-26: limpia espacios y limita el texto recibido a 80 caracteres",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        const texto =
          "   " +
          "astronauta ".repeat(20) +
          "   ";

        await buscarRecetas(
          "usuario-1",
          texto
        );

        const llamada = vi.mocked(
          prisma.peticionDisfraz.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data.texto.length
        ).toBeLessThanOrEqual(80);

        expect(
          llamada.data.texto.startsWith(" ")
        ).toBe(false);
      }
    );

    // ========================================================
    // REGISTRO DE PETICIONES
    // ========================================================

    it(
      "PF-BUS-27: registra una petición nueva con la receta encontrada",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta({
            id: "receta-bombero",
          }),
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "quiero un disfraz de bombero"
          );

        expect(
          prisma.peticionDisfraz.create
        ).toHaveBeenCalledWith({
          data: {
            usuarioId: "usuario-1",

            texto:
              "quiero un disfraz de bombero",

            textoNormalizado:
              "bombero",

            recetaId:
              "receta-bombero",
          },

          select: {
            id: true,
          },
        });

        expect(resultado.peticionId).toBe(
          "peticion-1"
        );
      }
    );

    it(
      "PF-BUS-28: registra recetaId null cuando no existe una coincidencia",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        await buscarRecetas(
          "usuario-1",
          "astronauta"
        );

        const llamada = vi.mocked(
          prisma.peticionDisfraz.create
        ).mock.calls[0][0] as any;

        expect(
          llamada.data.recetaId
        ).toBeNull();
      }
    );

    it(
      "PF-BUS-29: reutiliza una petición igual registrada durante los últimos diez minutos",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([
          receta(),
        ] as any);

        vi.mocked(
          prisma.peticionDisfraz.findFirst
        ).mockResolvedValue({
          id: "peticion-existente",
        } as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(resultado.peticionId).toBe(
          "peticion-existente"
        );

        expect(
          prisma.peticionDisfraz.create
        ).not.toHaveBeenCalled();

        const consulta = vi.mocked(
          prisma.peticionDisfraz.findFirst
        ).mock.calls[0][0] as any;

        expect(
          consulta.where.usuarioId
        ).toBe("usuario-1");

        expect(
          consulta.where.textoNormalizado
        ).toBe("bombero");

        expect(
          consulta.where.creadoEn.gt
        ).toBeInstanceOf(Date);
      }
    );

    // ========================================================
    // CATÁLOGO
    // ========================================================

    it(
      "PF-BUS-30: no consulta el catálogo cuando todos los tokens significativos tienen menos de cuatro letras",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "rey"
          );

        expect(resultado.catalogo).toEqual(
          []
        );

        expect(
          prisma.disfrazFisico.findMany
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-BUS-31: devuelve catálogo vacío cuando ningún disfraz coincide con la búsqueda",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Pirata",
            familia: "Pirata",
            tipoDisfraz: "AVENTURA",
            imagenUrl: null,
            precioAlquiler: 40,
          },
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "astronauta"
          );

        expect(resultado.catalogo).toEqual(
          []
        );

        expect(
          estadosDeDisfraces
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "PF-BUS-32: sugiere un disfraz disponible del catálogo que coincide con la búsqueda",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Bombero #1",
            familia: "Bombero",
            tipoDisfraz: "OFICIO",
            imagenUrl: "/bombero.jpg",
            precioAlquiler: "45.50",
          },
        ] as any);

        vi.mocked(
          estadosDeDisfraces
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Bombero #1",
            familia: "Bombero",
            estado: "DISPONIBLE",
          },
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(resultado.catalogo).toEqual([
          {
            familia: "Bombero",
            tipoDisfraz: "OFICIO",
            imagenUrl: "/bombero.jpg",
            precioDia: 45.5,
            disponibles: 1,
          },
        ]);
      }
    );

    it(
      "PF-BUS-33: no ofrece familias del catálogo que no tengan unidades disponibles",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Bombero #1",
            familia: "Bombero",
            tipoDisfraz: "OFICIO",
            imagenUrl: null,
            precioAlquiler: 45,
          },
        ] as any);

        vi.mocked(
          estadosDeDisfraces
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Bombero #1",
            familia: "Bombero",
            estado: "ALQUILADO",
          },
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(resultado.catalogo).toEqual(
          []
        );
      }
    );

    it(
      "PF-BUS-34: agrupa disfraces de la misma familia y cuenta solo los disponibles",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Batman #1",
            familia: "Batman",
            tipoDisfraz: "SUPERHEROE",
            imagenUrl: "/batman.jpg",
            precioAlquiler: 50,
          },

          {
            id: "d2",
            nombre: "Batman #2",
            familia: "Batman",
            tipoDisfraz: "SUPERHEROE",
            imagenUrl: "/batman.jpg",
            precioAlquiler: 50,
          },

          {
            id: "d3",
            nombre: "Batman #3",
            familia: "Batman",
            tipoDisfraz: "SUPERHEROE",
            imagenUrl: "/batman.jpg",
            precioAlquiler: 50,
          },
        ] as any);

        vi.mocked(
          estadosDeDisfraces
        ).mockResolvedValue([
          {
            id: "d1",
            estado: "DISPONIBLE",
          },

          {
            id: "d2",
            estado: "DISPONIBLE",
          },

          {
            id: "d3",
            estado: "ALQUILADO",
          },
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "batman"
          );

        expect(resultado.catalogo).toHaveLength(
          1
        );

        expect(
          resultado.catalogo[0].disponibles
        ).toBe(2);
      }
    );

    it(
      "PF-BUS-35: usa el nombre como familia cuando familia es null",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "d1",
            nombre: "Vampiro",
            familia: null,
            tipoDisfraz: "TERROR",
            imagenUrl: null,
            precioAlquiler: 40,
          },
        ] as any);

        vi.mocked(
          estadosDeDisfraces
        ).mockResolvedValue([
          {
            id: "d1",
            estado: "DISPONIBLE",
          },
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "vampiro"
          );

        expect(
          resultado.catalogo[0].familia
        ).toBe("Vampiro");
      }
    );

    it(
      "PF-BUS-36: ordena las familias por cantidad disponible",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue([
          {
            id: "b1",
            nombre: "Super Bombero #1",
            familia: "Super Bombero",
            tipoDisfraz: "OFICIO",
            imagenUrl: null,
            precioAlquiler: 50,
          },

          {
            id: "b2",
            nombre: "Super Bombero #2",
            familia: "Super Bombero",
            tipoDisfraz: "OFICIO",
            imagenUrl: null,
            precioAlquiler: 50,
          },

          {
            id: "c1",
            nombre: "Bombero clásico",
            familia: "Bombero clásico",
            tipoDisfraz: "OFICIO",
            imagenUrl: null,
            precioAlquiler: 45,
          },
        ] as any);

        vi.mocked(
          estadosDeDisfraces
        ).mockResolvedValue([
          {
            id: "b1",
            estado: "DISPONIBLE",
          },
          {
            id: "b2",
            estado: "DISPONIBLE",
          },
          {
            id: "c1",
            estado: "DISPONIBLE",
          },
        ] as any);

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(
          resultado.catalogo.map(
            (x) => x.familia
          )
        ).toEqual([
          "Super Bombero",
          "Bombero clásico",
        ]);
      }
    );

    it(
      "PF-BUS-37: limita las sugerencias del catálogo a cuatro familias",
      async () => {
        vi.mocked(
          prisma.receta.findMany
        ).mockResolvedValue([] as any);

        const disfraces = Array.from(
          { length: 6 },
          (_, index) => ({
            id: `d${index + 1}`,
            nombre: `Bombero ${index + 1}`,
            familia: `Bombero ${index + 1}`,
            tipoDisfraz: "OFICIO",
            imagenUrl: null,
            precioAlquiler: 40 + index,
          })
        );

        vi.mocked(
          prisma.disfrazFisico.findMany
        ).mockResolvedValue(
          disfraces as any
        );

        vi.mocked(
          estadosDeDisfraces
        ).mockResolvedValue(
          disfraces.map((d) => ({
            id: d.id,
            estado: "DISPONIBLE",
          })) as any
        );

        const resultado =
          await buscarRecetas(
            "usuario-1",
            "bombero"
          );

        expect(resultado.catalogo).toHaveLength(
          4
        );
      }
    );
  }
);