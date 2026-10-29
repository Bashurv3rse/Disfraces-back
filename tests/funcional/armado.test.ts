import { describe, expect, it } from "vitest";

import {
  elegirPiezas,
  opcionesPorHueco,
  validarTallas,
} from "../../src/modules/a-medida/armado.service";

import type {
  HuecoEntrada,
  InfoDonante,
  PiezaCandidata,
} from "../../src/modules/a-medida/armado.service";

const huecoCamisa: HuecoEntrada = {
  id: "h-camisa",
  etiqueta: "Camisa",
  tipo: "CAMISA",
  colores: ["rojo"],
  nombreContiene: null,
  obligatoria: true,
};

const huecoZapato: HuecoEntrada = {
  id: "h-zapato",
  etiqueta: "Zapatos",
  tipo: "ZAPATO",
  colores: ["negro"],
  nombreContiene: null,
  obligatoria: true,
};

const huecoAccesorio: HuecoEntrada = {
  id: "h-accesorio",
  etiqueta: "Accesorio",
  tipo: "ACCESORIO",
  colores: [],
  nombreContiene: null,
  obligatoria: false,
};

function pieza(
  datos: Partial<PiezaCandidata> &
    Pick<PiezaCandidata, "id" | "tipo" | "talla">
): PiezaCandidata {
  return {
    nombre: "Pieza",
    color: "rojo",
    origen: "ALMACEN",
    disfrazId: "almacen",
    disfrazNombre: "Almacén",
    ...datos,
  };
}

function donante(
  id: string,
  nombre: string,
  estado = "DISPONIBLE",
  disponiblesFamilia = 1
): InfoDonante {
  return {
    id,
    nombre,
    estado,
    disponiblesFamilia,
  };
}

describe("Pruebas funcionales - Armado de disfraz a medida", () => {
  it("PF-84: exige talla de ropa cuando la receta contiene prendas de ropa", () => {
    const errores = validarTallas(
      [huecoCamisa],
      {}
    );

    expect(errores).toContain(
      "Indica tu talla de ropa."
    );
  });

  it("PF-85: exige talla de calzado cuando la receta contiene zapatos", () => {
    const errores = validarTallas(
      [huecoZapato],
      {
        ropa: "M",
      }
    );

    expect(errores).toContain(
      "Indica tu talla de calzado."
    );
  });

  it("PF-86: rechaza una talla de ropa inválida", () => {
    const errores = validarTallas(
      [huecoCamisa],
      {
        ropa: "XXXX",
      }
    );

    expect(errores).toHaveLength(1);

    expect(errores[0]).toContain(
      "La talla de ropa «XXXX» no es válida."
    );
  });

  it("PF-87: permite un ajuste individual válido por pieza", () => {
    const errores = validarTallas(
      [huecoCamisa],
      {
        ajustes: {
          "h-camisa": "L",
        },
      }
    );

    expect(errores).toEqual([]);
  });

  it("PF-88: rechaza ajustes individuales para una pieza de talla única", () => {
    const errores = validarTallas(
      [huecoAccesorio],
      {
        ajustes: {
          "h-accesorio": "M",
        },
      }
    );

    expect(errores).toContain(
      "«Accesorio» es de talla única: no admite ajuste."
    );
  });

  it("PF-89: prioriza una pieza disponible del almacén antes que tomarla de otro disfraz", () => {
    const almacen: PiezaCandidata[] = [
      pieza({
        id: "almacen-camisa",
        nombre: "Camisa roja almacén",
        tipo: "CAMISA",
        talla: "M",
        color: "rojo",
        origen: "ALMACEN",
        disfrazId: "almacen",
        disfrazNombre: "Almacén",
      }),
    ];

    const donantes: PiezaCandidata[] = [
      pieza({
        id: "donante-camisa",
        nombre: "Camisa roja donante",
        tipo: "CAMISA",
        talla: "M",
        color: "rojo",
        origen: "DISFRAZ",
        disfrazId: "disfraz-1",
        disfrazNombre: "Bombero #1",
      }),
    ];

    const infoDonantes = new Map<
      string,
      InfoDonante
    >([
      [
        "disfraz-1",
        donante(
          "disfraz-1",
          "Bombero #1"
        ),
      ],
    ]);

    const resultado = elegirPiezas({
      huecos: [huecoCamisa],
      tallas: {
        ropa: "M",
      },
      almacen,
      donantes,
      infoDonantes,
    });

    expect(resultado.completo).toBe(true);
    expect(resultado.piezas).toHaveLength(1);

    expect(
      resultado.piezas[0].prendaId
    ).toBe("almacen-camisa");

    expect(
      resultado.piezas[0].origen
    ).toBe("ALMACEN");

    expect(resultado.piezasDeOtros).toBe(0);
    expect(
      resultado.disfracesAfectados
    ).toEqual([]);
  });

  it("PF-90: toma una pieza de otro disfraz cuando el almacén no puede cubrir un hueco obligatorio", () => {
    const donantes: PiezaCandidata[] = [
      pieza({
        id: "donante-camisa",
        nombre: "Camisa roja",
        tipo: "CAMISA",
        talla: "M",
        color: "rojo",
        origen: "DISFRAZ",
        disfrazId: "disfraz-1",
        disfrazNombre: "Bombero #1",
      }),
    ];

    const infoDonantes = new Map<
      string,
      InfoDonante
    >([
      [
        "disfraz-1",
        donante(
          "disfraz-1",
          "Bombero #1"
        ),
      ],
    ]);

    const resultado = elegirPiezas({
      huecos: [huecoCamisa],
      tallas: {
        ropa: "M",
      },
      almacen: [],
      donantes,
      infoDonantes,
    });

    expect(resultado.completo).toBe(true);
    expect(resultado.piezasDeOtros).toBe(1);

    expect(
      resultado.piezas[0].origen
    ).toBe("DISFRAZ");

    expect(
      resultado.disfracesAfectados
    ).toEqual([
      expect.objectContaining({
        id: "disfraz-1",
        nombre: "Bombero #1",
        piezasTomadas: 1,
        pierdeDisponibilidad: true,
      }),
    ]);
  });

  it("PF-91: respeta el máximo de dos piezas tomadas de otros disfraces", () => {
    const huecos: HuecoEntrada[] = [
      {
        id: "h1",
        etiqueta: "Camisa",
        tipo: "CAMISA",
        colores: [],
        nombreContiene: null,
        obligatoria: true,
      },
      {
        id: "h2",
        etiqueta: "Pantalón",
        tipo: "PANTALON",
        colores: [],
        nombreContiene: null,
        obligatoria: true,
      },
      {
        id: "h3",
        etiqueta: "Chaleco",
        tipo: "CHALECO",
        colores: [],
        nombreContiene: null,
        obligatoria: true,
      },
    ];

    const donantes: PiezaCandidata[] = [
      pieza({
        id: "p1",
        tipo: "CAMISA",
        talla: "M",
        origen: "DISFRAZ",
        disfrazId: "d1",
        disfrazNombre: "Disfraz 1",
      }),
      pieza({
        id: "p2",
        tipo: "PANTALON",
        talla: "M",
        origen: "DISFRAZ",
        disfrazId: "d2",
        disfrazNombre: "Disfraz 2",
      }),
      pieza({
        id: "p3",
        tipo: "CHALECO",
        talla: "M",
        origen: "DISFRAZ",
        disfrazId: "d3",
        disfrazNombre: "Disfraz 3",
      }),
    ];

    const infoDonantes = new Map<
      string,
      InfoDonante
    >([
      ["d1", donante("d1", "Disfraz 1")],
      ["d2", donante("d2", "Disfraz 2")],
      ["d3", donante("d3", "Disfraz 3")],
    ]);

    const resultado = elegirPiezas({
      huecos,
      tallas: {
        ropa: "M",
      },
      almacen: [],
      donantes,
      infoDonantes,
    });

    expect(resultado.piezasDeOtros).toBe(2);
    expect(resultado.piezas).toHaveLength(2);
    expect(resultado.faltantes).toHaveLength(1);
    expect(resultado.completo).toBe(false);

    expect(
      resultado.faltantes[0].motivo
    ).toContain(
      "el máximo es 2"
    );
  });

  it("PF-92: un hueco opcional sin pieza disponible se omite sin volver incompleto el disfraz", () => {
    const resultado = elegirPiezas({
      huecos: [
        huecoCamisa,
        huecoAccesorio,
      ],
      tallas: {
        ropa: "M",
      },
      almacen: [
        pieza({
          id: "camisa-1",
          nombre: "Camisa roja",
          tipo: "CAMISA",
          talla: "M",
          color: "rojo",
        }),
      ],
      donantes: [],
      infoDonantes: new Map(),
    });

    expect(resultado.piezas).toHaveLength(1);
    expect(resultado.omitidas).toHaveLength(1);
    expect(resultado.faltantes).toHaveLength(0);

    expect(
      resultado.omitidas[0].huecoId
    ).toBe("h-accesorio");

    expect(resultado.completo).toBe(true);
  });

  it("PF-93: informa las tallas disponibles para cada hueco de la receta", () => {
    const almacen: PiezaCandidata[] = [
      pieza({
        id: "camisa-s",
        tipo: "CAMISA",
        talla: "S",
      }),
      pieza({
        id: "camisa-m",
        tipo: "CAMISA",
        talla: "M",
      }),
    ];

    const donantes: PiezaCandidata[] = [
      pieza({
        id: "camisa-l",
        tipo: "CAMISA",
        talla: "L",
        origen: "DISFRAZ",
        disfrazId: "d1",
        disfrazNombre: "Disfraz 1",
      }),
    ];

    const opciones = opcionesPorHueco(
      [huecoCamisa],
      almacen,
      donantes
    );

    expect(opciones).toHaveLength(1);

    expect(opciones[0]).toEqual({
      huecoId: "h-camisa",
      etiqueta: "Camisa",
      tipo: "CAMISA",
      categoria: "ROPA",
      tallas: ["S", "M", "L"],
    });
  });
});