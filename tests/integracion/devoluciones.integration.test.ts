import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../../src/config/prisma";
import {
  crearDevolucion,
  ErrorDevolucion,
} from "../../src/modules/devoluciones/devoluciones.service";

describe("Pruebas de integración - devolución de alquileres", () => {
  const emailPrueba = "integracion-devolucion@test.local";

  async function limpiarDatos() {
    const usuario = await prisma.usuario.findUnique({
      where: { email: emailPrueba },
    });

    if (!usuario) {
      return;
    }

    const alquileres = await prisma.alquiler.findMany({
      where: { usuarioId: usuario.id },
      select: { id: true },
    });

    const alquilerIds = alquileres.map((a) => a.id);

    if (alquilerIds.length > 0) {
      const devoluciones = await prisma.devolucion.findMany({
        where: {
          alquilerId: {
            in: alquilerIds,
          },
        },
        select: { id: true },
      });

      const devolucionIds = devoluciones.map((d) => d.id);

      if (devolucionIds.length > 0) {
        await prisma.devolucionPrenda.deleteMany({
          where: {
            devolucionId: {
              in: devolucionIds,
            },
          },
        });
      }

      await prisma.devolucion.deleteMany({
        where: {
          alquilerId: {
            in: alquilerIds,
          },
        },
      });

      await prisma.pago.deleteMany({
        where: {
          alquilerId: {
            in: alquilerIds,
          },
        },
      });

      await prisma.alquilerDisfraz.deleteMany({
        where: {
          alquilerId: {
            in: alquilerIds,
          },
        },
      });

      await prisma.alquiler.deleteMany({
        where: {
          id: {
            in: alquilerIds,
          },
        },
      });
    }

    const disfraces = await prisma.disfrazFisico.findMany({
      where: {
        nombre: {
          startsWith: "TEST-INTEGRACION-",
        },
      },
      select: { id: true },
    });

    const disfrazIds = disfraces.map((d) => d.id);

    if (disfrazIds.length > 0) {
      await prisma.sustitucion.deleteMany({
        where: {
          OR: [
            {
              disfrazOrigenId: {
                in: disfrazIds,
              },
            },
            {
              disfrazDestinoId: {
                in: disfrazIds,
              },
            },
          ],
        },
      });

      await prisma.prenda.deleteMany({
        where: {
          OR: [
            {
              disfrazHogarId: {
                in: disfrazIds,
              },
            },
            {
              disfrazActualId: {
                in: disfrazIds,
              },
            },
          ],
        },
      });

      await prisma.disfrazFisico.deleteMany({
        where: {
          id: {
            in: disfrazIds,
          },
        },
      });
    }

    await prisma.sesionActiva.deleteMany({
      where: { usuarioId: usuario.id },
    });

    await prisma.usuario.delete({
      where: { id: usuario.id },
    });
  }

  async function prepararAlquiler() {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Usuario Devolución",
        email: emailPrueba,
        password: "hash-no-relevante",
        telefono: "987654321",
        direccion: "Dirección de prueba",
        rol: "CLIENTE",
      },
    });

    const disfraz = await prisma.disfrazFisico.create({
      data: {
        nombre: "TEST-INTEGRACION-DISFRAZ",
        tipoDisfraz: "TRADICIONAL",
        temporadaEvento: "PRUEBA",
        precioAlquiler: 50,
      },
    });

    const prenda1 = await prisma.prenda.create({
      data: {
        nombre: "TEST-INTEGRACION-CAMISA",
        tipo: "CAMISA",
        color: "Blanco",
        talla: "M",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    const prenda2 = await prisma.prenda.create({
      data: {
        nombre: "TEST-INTEGRACION-PANTALON",
        tipo: "PANTALON",
        color: "Negro",
        talla: "M",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    const alquiler = await prisma.alquiler.create({
      data: {
        usuarioId: usuario.id,
        fechaInicio: new Date("2026-10-20T12:00:00"),
        fechaFin: new Date("2026-10-25T12:00:00"),
        estado: "ACTIVO",
        montoTotal: 250,
        montoGarantia: 62.5,

        disfraces: {
          create: {
            disfrazFisicoId: disfraz.id,
            precioUnitario: 50,
          },
        },
      },
    });

    return {
      usuario,
      disfraz,
      prenda1,
      prenda2,
      alquiler,
    };
  }

  beforeEach(async () => {
    await limpiarDatos();
  });

  afterAll(async () => {
    await limpiarDatos();
    await prisma.$disconnect();
  });

  it("PI-06: registra una devolución completa y finaliza el alquiler", async () => {
    const {
      usuario,
      alquiler,
      prenda1,
      prenda2,
    } = await prepararAlquiler();

    const resultado = await crearDevolucion(
      {
        alquilerId: alquiler.id,
        fechaDevolucion: "2026-10-25",
        prendas: [
          {
            prendaId: prenda1.id,
            estadoPrenda: "BUEN_ESTADO",
          },
          {
            prendaId: prenda2.id,
            estadoPrenda: "BUEN_ESTADO",
          },
        ],
        observaciones: "Devolución completa",
      },
      usuario.id
    );

    expect(resultado.devolucion).toBeDefined();
    expect(resultado.sustituciones).toHaveLength(0);

    const devolucionGuardada =
      await prisma.devolucion.findUnique({
        where: {
          alquilerId: alquiler.id,
        },
        include: {
          prendas: true,
        },
      });

    expect(devolucionGuardada).not.toBeNull();
    expect(devolucionGuardada?.estado).toBe("APROBADA");
    expect(devolucionGuardada?.prendas).toHaveLength(2);

    const alquilerActualizado =
      await prisma.alquiler.findUnique({
        where: {
          id: alquiler.id,
        },
      });

    expect(alquilerActualizado?.estado).toBe("FINALIZADO");
  });

  it("TC-BE-GAR-01: una devolución deja la garantía en estado PENDIENTE", async () => {
    const {
      usuario,
      alquiler,
      prenda1,
      prenda2,
    } = await prepararAlquiler();

    await crearDevolucion(
      {
        alquilerId: alquiler.id,
        fechaDevolucion: "2026-10-25",
        prendas: [
          {
            prendaId: prenda1.id,
            estadoPrenda: "BUEN_ESTADO",
          },
          {
            prendaId: prenda2.id,
            estadoPrenda: "BUEN_ESTADO",
          },
        ],
      },
      usuario.id
    );

    const devolucion =
      await prisma.devolucion.findUnique({
        where: {
          alquilerId: alquiler.id,
        },
      });

    expect(devolucion?.garantiaEstado).toBe("PENDIENTE");
  });

  it("PI-08: una prenda reportada como DANADA actualiza su estado físico", async () => {
    const {
      usuario,
      alquiler,
      prenda1,
      prenda2,
    } = await prepararAlquiler();

    await crearDevolucion(
      {
        alquilerId: alquiler.id,
        fechaDevolucion: "2026-10-25",
        prendas: [
          {
            prendaId: prenda1.id,
            estadoPrenda: "DANADA",
          },
          {
            prendaId: prenda2.id,
            estadoPrenda: "BUEN_ESTADO",
          },
        ],
      },
      usuario.id
    );

    const prendaActualizada =
      await prisma.prenda.findUnique({
        where: {
          id: prenda1.id,
        },
      });

    expect(prendaActualizada?.estado).toBe("DANADA");
  });

  it("PI-09: una prenda reportada como FALTANTE actualiza su estado físico", async () => {
    const {
      usuario,
      alquiler,
      prenda1,
      prenda2,
    } = await prepararAlquiler();

    await crearDevolucion(
      {
        alquilerId: alquiler.id,
        fechaDevolucion: "2026-10-25",
        prendas: [
          {
            prendaId: prenda1.id,
            estadoPrenda: "FALTANTE",
          },
          {
            prendaId: prenda2.id,
            estadoPrenda: "BUEN_ESTADO",
          },
        ],
      },
      usuario.id
    );

    const prendaActualizada =
      await prisma.prenda.findUnique({
        where: {
          id: prenda1.id,
        },
      });

    expect(prendaActualizada?.estado).toBe("FALTANTE");
  });

  it("TC-BE-DEV-05: rechaza una devolución que no reporta todas las prendas del alquiler", async () => {
    const {
      usuario,
      alquiler,
      prenda1,
    } = await prepararAlquiler();

    await expect(
      crearDevolucion(
        {
          alquilerId: alquiler.id,
          fechaDevolucion: "2026-10-25",
          prendas: [
            {
              prendaId: prenda1.id,
              estadoPrenda: "BUEN_ESTADO",
            },
          ],
        },
        usuario.id
      )
    ).rejects.toMatchObject({
    message:
        "Debes reportar el estado de todas las prendas del alquiler.",
    estado: 400,
    });

    const devolucion =
      await prisma.devolucion.findUnique({
        where: {
          alquilerId: alquiler.id,
        },
      });

    expect(devolucion).toBeNull();
  });

  it("TC-BE-DEV-04: rechaza una prenda que no pertenece al alquiler", async () => {
    const {
      usuario,
      alquiler,
      prenda1,
    } = await prepararAlquiler();

    const disfrazAjeno =
      await prisma.disfrazFisico.create({
        data: {
          nombre: "TEST-INTEGRACION-AJENO",
          tipoDisfraz: "TRADICIONAL",
          temporadaEvento: "PRUEBA",
          precioAlquiler: 30,
        },
      });

    const prendaAjena =
      await prisma.prenda.create({
        data: {
          nombre: "TEST-INTEGRACION-PRENDA-AJENA",
          tipo: "CAMISA",
          color: "Rojo",
          talla: "L",
          disfrazHogarId: disfrazAjeno.id,
          disfrazActualId: disfrazAjeno.id,
        },
      });

    await expect(
      crearDevolucion(
        {
          alquilerId: alquiler.id,
          fechaDevolucion: "2026-10-25",
          prendas: [
            {
              prendaId: prenda1.id,
              estadoPrenda: "BUEN_ESTADO",
            },
            {
              prendaId: prendaAjena.id,
              estadoPrenda: "BUEN_ESTADO",
            },
          ],
        },
        usuario.id
      )
    ).rejects.toMatchObject({
    message:
        "El reporte incluye prendas que no pertenecen a este alquiler.",
    estado: 400,
    });
    const devolucion =
      await prisma.devolucion.findUnique({
        where: {
          alquilerId: alquiler.id,
        },
      });

    expect(devolucion).toBeNull();
  });
});