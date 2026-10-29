import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  proponerArmado: vi.fn(),
  reservarAMedida: vi.fn(),
  listarReservasActivas: vi.fn(),
}));

vi.mock(
  "../../src/modules/a-medida/armado.service",
  () => ({
    proponerArmado: mocks.proponerArmado,
  })
);

vi.mock(
  "../../src/modules/a-medida/reservas.service",
  () => ({
    ErrorReserva: class ErrorReserva extends Error {
      constructor(
        mensaje: string,
        public readonly estado = 400
      ) {
        super(mensaje);
      }
    },
    reservarAMedida: mocks.reservarAMedida,
    listarReservasActivas:
      mocks.listarReservasActivas,
  })
);

import {
  misReservas,
  previsualizar,
  reservar,
} from "../../src/modules/a-medida/a-medida.service";

const propuestaBase = {
  receta: {
    id: "receta-1",
    nombre: "Bombero",
    precioDia: 40,
    activa: true,
  },

  tallas: {
    ropa: "M",
  },

  completo: true,

  piezas: [
    {
      huecoId: "h1",
      etiqueta: "Camisa",
      tipo: "CAMISA",
      obligatoria: true,
      prendaId: "prenda-1",
      nombre: "Camisa roja",
      color: "rojo",
      talla: "M",
      origen: "ALMACEN",
      disfrazOrigenId: "almacen-1",
      disfrazOrigenNombre: "Almacén",
    },
  ],

  omitidas: [],

  faltantes: [],

  piezasDeOtros: 0,

  disfracesAfectados: [],

  opciones: [
    {
      huecoId: "h1",
      etiqueta: "Camisa",
      tipo: "CAMISA",
      categoria: "ROPA",
      tallas: ["S", "M", "L"],
    },
  ],
};

describe("Pruebas funcionales - Servicio A medida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PF-94: previsualiza una propuesta activa mostrando solo información destinada al cliente", async () => {
    mocks.proponerArmado.mockResolvedValue(
      propuestaBase
    );

    const resultado = await previsualizar(
      "receta-1",
      {
        ropa: "M",
      }
    );

    expect(
      mocks.proponerArmado
    ).toHaveBeenCalledWith(
      "receta-1",
      {
        ropa: "M",
      }
    );

    expect(resultado.receta).toEqual({
      id: "receta-1",
      nombre: "Bombero",
      precioDia: 40,
    });

    expect(resultado.completo).toBe(true);

    expect(resultado.piezas).toEqual([
      {
        huecoId: "h1",
        etiqueta: "Camisa",
        tipo: "CAMISA",
        nombre: "Camisa roja",
        color: "rojo",
        talla: "M",
        obligatoria: true,
      },
    ]);

    expect(resultado.opciones).toEqual(
      propuestaBase.opciones
    );

    // Información interna del armado no debe
    // exponerse en la vista del cliente.
    expect(
      resultado.piezas[0]
    ).not.toHaveProperty("prendaId");

    expect(
      resultado.piezas[0]
    ).not.toHaveProperty("origen");

    expect(
      resultado.piezas[0]
    ).not.toHaveProperty(
      "disfrazOrigenId"
    );
  });

  it("PF-95: rechaza la previsualización cuando la receta está inactiva", async () => {
    mocks.proponerArmado.mockResolvedValue({
      ...propuestaBase,
      receta: {
        ...propuestaBase.receta,
        activa: false,
      },
    });

    await expect(
      previsualizar("receta-1", {
        ropa: "M",
      })
    ).rejects.toMatchObject({
      message:
        "Esta receta no está disponible.",
      estado: 404,
    });
  });

  it("PF-96: reserva un disfraz a medida y devuelve los datos necesarios para el cliente", async () => {
    const vence = new Date(
      Date.now() + 10 * 60 * 1000
    );

    mocks.reservarAMedida.mockResolvedValue({
      reservaId: "reserva-1",
      disfrazId: "disfraz-a-medida-1",
      nombre: "Bombero a medida",
      vence,
      propuesta: propuestaBase,
    });

    const resultado = await reservar(
      "usuario-1",
      "receta-1",
      {
        ropa: "M",
      },
      "Quiero un bombero"
    );

    expect(
      mocks.reservarAMedida
    ).toHaveBeenCalledWith(
      "usuario-1",
      "receta-1",
      {
        ropa: "M",
      },
      "Quiero un bombero"
    );

    expect(resultado.reserva).toEqual(
      expect.objectContaining({
        reservaId: "reserva-1",
        disfrazId: "disfraz-a-medida-1",
        nombre: "Bombero a medida",
        tipoDisfraz: "A medida",
        precioDia: 40,
        receta: "Bombero",
      })
    );

    expect(
      resultado.reserva.segundosRestantes
    ).toBeGreaterThan(0);

    expect(
      resultado.reserva.segundosRestantes
    ).toBeLessThanOrEqual(600);

    expect(resultado.reserva.piezas).toEqual([
      {
        huecoId: "h1",
        etiqueta: "Camisa",
        tipo: "CAMISA",
        nombre: "Camisa roja",
        color: "rojo",
        talla: "M",
        obligatoria: true,
      },
    ]);
  });

  it("PF-97: genera la auditoría indicando piezas tomadas de otros disfraces", async () => {
    const propuestaConDonantes = {
      ...propuestaBase,

      piezasDeOtros: 2,

      disfracesAfectados: [
        {
          id: "d1",
          nombre: "Bombero #1",
          estadoAntes: "DISPONIBLE",
          pierdeDisponibilidad: true,
          piezasTomadas: 2,
        },
      ],
    };

    mocks.reservarAMedida.mockResolvedValue({
      reservaId: "reserva-2",
      disfrazId: "disfraz-a-medida-2",
      nombre: "Bombero personalizado",
      vence: new Date(
        Date.now() + 10 * 60 * 1000
      ),
      propuesta: propuestaConDonantes,
    });

    const resultado = await reservar(
      "usuario-1",
      "receta-1",
      {
        ropa: "M",
      }
    );

    expect(resultado.auditoria).toBe(
      "Bombero · 1 piezas · 2 de otros disfraces [Bombero #1 (2)]"
    );
  });

  it("PF-98: lista las reservas activas del usuario transformando correctamente catálogo y A medida", async () => {
    mocks.listarReservasActivas.mockResolvedValue([
      {
        id: "reserva-1",
        tipo: "A_MEDIDA",
        vence: new Date(
          "2099-12-31T23:59:59.000Z"
        ),
        segundosRestantes: 500,
        receta: "Bombero",
        disfraz: {
          id: "disfraz-1",
          nombre: "Bombero personalizado",
          precioAlquiler: "40.00",
          prendasActuales: [
            {
              id: "p1",
              nombre: "Camisa roja",
              tipo: "CAMISA",
              color: "rojo",
              talla: "M",
            },
          ],
        },
      },

      {
        id: "reserva-2",
        tipo: "CATALOGO",
        vence: new Date(
          "2099-12-31T23:59:59.000Z"
        ),
        segundosRestantes: 400,
        receta: null,
        disfraz: {
          id: "disfraz-2",
          nombre: "Pirata #1",
          precioAlquiler: "35.50",
          prendasActuales: [
            {
              id: "p2",
              nombre: "Sombrero pirata",
              tipo: "SOMBRERO",
              color: "negro",
              talla: "M",
            },
          ],
        },
      },
    ]);

    const resultado =
      await misReservas("usuario-1");

    expect(
      mocks.listarReservasActivas
    ).toHaveBeenCalledWith("usuario-1");

    expect(resultado).toHaveLength(2);

    expect(resultado[0]).toEqual(
      expect.objectContaining({
        reservaId: "reserva-1",
        tipo: "A_MEDIDA",
        receta: "Bombero",
        disfraz: expect.objectContaining({
          id: "disfraz-1",
          nombre: "Bombero personalizado",
          tipoDisfraz: "A medida",
          precioDia: 40,
        }),
      })
    );

    expect(resultado[0].piezas[0]).toEqual({
      id: "p1",
      nombre: "Camisa roja",
      tipo: "CAMISA",
      color: "rojo",
      talla: "M",
    });

    expect(resultado[1].disfraz).toEqual(
      expect.objectContaining({
        id: "disfraz-2",
        nombre: "Pirata #1",
        tipoDisfraz: "Catálogo",
        precioDia: 35.5,
      })
    );
  });
});