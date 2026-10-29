import bcrypt from "bcryptjs";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../../src/config/prisma";

import {
  previsualizar,
  reservar,
} from "../../src/modules/a-medida/a-medida.service";

import {
  cancelarReserva,
} from "../../src/modules/a-medida/reservas.service";

let usuarioId: string;
let recetaId: string;

let almacenId: string;
let prendaCamisaId: string;
let prendaPantalonId: string;

let reservaCreadaId: string | null = null;
let disfrazCreadoId: string | null = null;

const EMAIL =
  `integracion-medida-${Date.now()}@test.com`;

describe(
  "Integración - A medida, inventario y PostgreSQL",
  () => {
    beforeAll(async () => {
      if (process.env.NODE_ENV !== "test") {
        throw new Error(
          "Las pruebas de integración solo pueden ejecutarse con NODE_ENV=test."
        );
      }

      const databaseUrl =
        process.env.DATABASE_URL ?? "";

      if (
        !databaseUrl.includes(
          "disfraz_test_db"
        )
      ) {
        throw new Error(
          "DATABASE_URL no apunta a disfraz_test_db. Prueba cancelada por seguridad."
        );
      }

      // ============================
      // Usuario
      // ============================

      const password =
        await bcrypt.hash(
          "Prueba123!",
          10
        );

      const usuario =
        await prisma.usuario.create({
          data: {
            nombre:
              "Cliente Integración A Medida",
            email: EMAIL,
            password,
            telefono: "999999999",
            direccion:
              "Dirección integración",
            rol: "CLIENTE",
            tallaRopa: "M",
            tallaCalzado: "40",
          },
        });

      usuarioId = usuario.id;

      // ============================
      // Almacén físico
      // ============================

      const almacen =
        await prisma.disfrazFisico.create({
          data: {
            nombre:
              "Almacén Integración A Medida",
            tipoDisfraz: "ALMACEN_TEST",
            temporadaEvento:
              "integracion",
            precioAlquiler: 0,
            origen: "ALMACEN",
          },
        });

      almacenId = almacen.id;

      // ============================
      // Prendas físicas reales
      // ============================

      const camisa =
        await prisma.prenda.create({
          data: {
            nombre:
              "Camisa integración",
            tipo: "CAMISA",
            color: "rojo",
            talla: "M",
            calidad: "bueno",
            estado: "DISPONIBLE",
            disfrazHogarId:
              almacenId,
            disfrazActualId:
              almacenId,
          },
        });

      prendaCamisaId = camisa.id;

      const pantalon =
        await prisma.prenda.create({
          data: {
            nombre:
              "Pantalón integración",
            tipo: "PANTALON",
            color: "negro",
            talla: "M",
            calidad: "bueno",
            estado: "DISPONIBLE",
            disfrazHogarId:
              almacenId,
            disfrazActualId:
              almacenId,
          },
        });

      prendaPantalonId =
        pantalon.id;

      // ============================
      // Receta real
      // ============================

      const receta =
        await prisma.receta.create({
          data: {
            nombre:
              `Receta integración ${Date.now()}`,
            descripcion:
              "Receta creada para pruebas de integración",
            palabrasClave: [
              "integracion",
              "prueba",
            ],
            precioDia: 45,
            activa: true,

            piezas: {
              create: [
                {
                  etiqueta:
                    "Camisa principal",
                  tipo: "CAMISA",
                  colores: ["rojo"],
                  obligatoria: true,
                },
                {
                  etiqueta:
                    "Pantalón principal",
                  tipo: "PANTALON",
                  colores: ["negro"],
                  obligatoria: true,
                },
              ],
            },
          },
        });

      recetaId = receta.id;
    });

    afterAll(async () => {
      // ============================
      // Limpieza
      // ============================

      if (reservaCreadaId) {
        await prisma.movimientoPrenda.deleteMany({
          where: {
            reservaId:
              reservaCreadaId,
          },
        });

        await prisma.reserva.deleteMany({
          where: {
            id: reservaCreadaId,
          },
        });
      }

      /*
       * Si PI-21 movió las prendas al disfraz
       * A medida, primero las regresamos al
       * almacén para poder eliminar el disfraz.
       */
      if (disfrazCreadoId) {
        await prisma.prenda.updateMany({
          where: {
            disfrazActualId:
              disfrazCreadoId,
          },
          data: {
            disfrazActualId:
              almacenId,
          },
        });

        await prisma.disfrazFisico.deleteMany({
          where: {
            id: disfrazCreadoId,
          },
        });
      }

      if (recetaId) {
        // RecetaPieza usa onDelete Cascade.
        await prisma.receta.deleteMany({
          where: {
            id: recetaId,
          },
        });
      }

      if (almacenId) {
        await prisma.prenda.deleteMany({
          where: {
            disfrazHogarId:
              almacenId,
          },
        });

        await prisma.disfrazFisico.deleteMany({
          where: {
            id: almacenId,
          },
        });
      }

      if (usuarioId) {
        await prisma.sesionActiva.deleteMany({
          where: {
            usuarioId,
          },
        });

        await prisma.usuario.deleteMany({
          where: {
            id: usuarioId,
          },
        });
      }

      await prisma.$disconnect();
    });

    it(
      "TC-BE-ARM-02: previsualiza un disfraz A medida usando inventario real sin modificar ni reservar las piezas",
      async () => {
        // Estado inicial de las piezas.
        const camisaAntes =
          await prisma.prenda.findUnique({
            where: {
              id: prendaCamisaId,
            },
          });

        const pantalonAntes =
          await prisma.prenda.findUnique({
            where: {
              id: prendaPantalonId,
            },
          });

        expect(
          camisaAntes?.disfrazActualId
        ).toBe(almacenId);

        expect(
          pantalonAntes?.disfrazActualId
        ).toBe(almacenId);

        // No debe existir ninguna reserva
        // para este usuario todavía.
        const reservasAntes =
          await prisma.reserva.count({
            where: {
              usuarioId,
            },
          });

        expect(reservasAntes).toBe(0);

        // ============================
        // Previsualización real
        // ============================

        const resultado =
          await previsualizar(
            recetaId,
            {
              ropa: "M",
            }
          );

        expect(resultado.completo).toBe(
          true
        );

        expect(resultado.receta).toEqual(
          expect.objectContaining({
            id: recetaId,
            precioDia: 45,
          })
        );

        expect(resultado.piezas).toHaveLength(
          2
        );

        expect(
          resultado.faltantes
        ).toHaveLength(0);

        const nombres =
          resultado.piezas.map(
            (p) => p.nombre
          );

        expect(nombres).toContain(
          "Camisa integración"
        );

        expect(nombres).toContain(
          "Pantalón integración"
        );

        // ============================
        // PostgreSQL NO debe cambiar
        // ============================

        const reservasDespues =
          await prisma.reserva.count({
            where: {
              usuarioId,
            },
          });

        expect(reservasDespues).toBe(0);

        const movimientosDespues =
          await prisma.movimientoPrenda.count({
            where: {
              prendaId: {
                in: [
                  prendaCamisaId,
                  prendaPantalonId,
                ],
              },
            },
          });

        expect(
          movimientosDespues
        ).toBe(0);

        const camisaDespues =
          await prisma.prenda.findUnique({
            where: {
              id: prendaCamisaId,
            },
          });

        const pantalonDespues =
          await prisma.prenda.findUnique({
            where: {
              id: prendaPantalonId,
            },
          });

        expect(
          camisaDespues?.disfrazActualId
        ).toBe(almacenId);

        expect(
          pantalonDespues?.disfrazActualId
        ).toBe(almacenId);

        expect(
          camisaDespues?.estado
        ).toBe("DISPONIBLE");

        expect(
          pantalonDespues?.estado
        ).toBe("DISPONIBLE");
      }
    );

    it(
      "PI-21: reserva un disfraz A medida, crea la reserva y mueve físicamente las piezas en PostgreSQL",
      async () => {
        const resultado =
          await reservar(
            usuarioId,
            recetaId,
            {
              ropa: "M",
            },
            "Petición de integración"
          );

        const reservaId =
        resultado.reserva.reservaId;

        const disfrazId =
        resultado.reserva.disfrazId;

        reservaCreadaId = reservaId;
        disfrazCreadoId = disfrazId;

        // ============================
        // Respuesta del servicio
        // ============================

        expect(
          resultado.reserva.tipoDisfraz
        ).toBe("A medida");

        expect(
          resultado.reserva.precioDia
        ).toBe(45);

        expect(
          resultado.reserva.receta
        ).toContain(
          "Receta integración"
        );

        expect(
          resultado.reserva.piezas
        ).toHaveLength(2);

        expect(
          resultado.reserva
            .segundosRestantes
        ).toBeGreaterThan(0);

        // ============================
        // Disfraz físico generado
        // ============================

        const disfrazBD =
          await prisma.disfrazFisico.findUnique({
            where: {
              id: disfrazCreadoId,
            },
          });

        expect(disfrazBD).not.toBeNull();

        expect(
          disfrazBD?.origen
        ).toBe("A_MEDIDA");

        expect(
          disfrazBD?.tipoDisfraz
        ).toBe("A medida");

        expect(
          Number(
            disfrazBD?.precioAlquiler
          )
        ).toBe(45);

        // ============================
        // Reserva persistida
        // ============================

        const reservaBD =
          await prisma.reserva.findUnique({
            where: {
              id: reservaCreadaId,
            },

            include: {
              movimientos: true,
            },
          });

        expect(reservaBD).not.toBeNull();

        expect(
          reservaBD?.usuarioId
        ).toBe(usuarioId);

        expect(
          reservaBD?.recetaId
        ).toBe(recetaId);

        expect(
          reservaBD?.disfrazFisicoId
        ).toBe(disfrazCreadoId);

        expect(
          reservaBD?.tipo
        ).toBe("A_MEDIDA");

        expect(
          reservaBD?.peticion
        ).toBe(
          "Petición de integración"
        );

        expect(
          reservaBD?.tallaRopa
        ).toBe("M");

        expect(
          reservaBD?.confirmadaEn
        ).toBeNull();

        expect(
          reservaBD?.liberadaEn
        ).toBeNull();

        // ============================
        // Movimientos de prendas
        // ============================

        expect(
          reservaBD?.movimientos
        ).toHaveLength(2);

        const movimientos =
          reservaBD!.movimientos;

        expect(
          movimientos.map(
            (m) => m.prendaId
          )
        ).toEqual(
          expect.arrayContaining([
            prendaCamisaId,
            prendaPantalonId,
          ])
        );

        for (const movimiento of movimientos) {
          expect(
            movimiento.desdeId
          ).toBe(almacenId);

          expect(
            movimiento.haciaId
          ).toBe(disfrazCreadoId);
        }

        // ============================
        // Movimiento físico real
        // ============================

        const prendasMovidas =
          await prisma.prenda.findMany({
            where: {
              id: {
                in: [
                  prendaCamisaId,
                  prendaPantalonId,
                ],
              },
            },
          });

        expect(
          prendasMovidas
        ).toHaveLength(2);

        for (const prenda of prendasMovidas) {
          // El hogar continúa siendo el almacén.
          expect(
            prenda.disfrazHogarId
          ).toBe(almacenId);

          // Pero físicamente ahora pertenece
          // al disfraz A medida reservado.
          expect(
            prenda.disfrazActualId
          ).toBe(disfrazCreadoId);

          expect(
            prenda.estado
          ).toBe("DISPONIBLE");
        }

        // ============================
        // Relación inversa
        // ============================

        const disfrazConPrendas =
          await prisma.disfrazFisico.findUnique({
            where: {
              id: disfrazCreadoId,
            },

            include: {
              prendasActuales: true,
            },
          });

        expect(
          disfrazConPrendas
            ?.prendasActuales
        ).toHaveLength(2);

        expect(
          disfrazConPrendas
            ?.prendasActuales
            .map((p) => p.id)
        ).toEqual(
          expect.arrayContaining([
            prendaCamisaId,
            prendaPantalonId,
          ])
        );
      }
    );
        it(
    "PI-22: cancelar una reserva A medida devuelve las piezas a su origen y elimina la reserva y el disfraz temporal",
    async () => {
        /*
        * PI-21 creó una reserva real y movió las
        * prendas desde el almacén hacia el
        * disfraz A medida.
        */
        expect(reservaCreadaId).not.toBeNull();
        expect(disfrazCreadoId).not.toBeNull();

        const reservaId =
        reservaCreadaId as string;

        const disfrazId =
        disfrazCreadoId as string;

        // ============================
        // Estado previo
        // ============================

        const reservaAntes =
        await prisma.reserva.findUnique({
            where: {
            id: reservaId,
            },
            include: {
            movimientos: true,
            },
        });

        expect(reservaAntes).not.toBeNull();

        expect(
        reservaAntes?.confirmadaEn
        ).toBeNull();

        expect(
        reservaAntes?.liberadaEn
        ).toBeNull();

        expect(
        reservaAntes?.movimientos
        ).toHaveLength(2);

        const prendasAntes =
        await prisma.prenda.findMany({
            where: {
            id: {
                in: [
                prendaCamisaId,
                prendaPantalonId,
                ],
            },
            },
        });

        expect(prendasAntes).toHaveLength(2);

        for (const prenda of prendasAntes) {
        expect(
            prenda.disfrazActualId
        ).toBe(disfrazId);
        }

        // ============================
        // Cancelación real
        // ============================

        await cancelarReserva(
        reservaId,
        usuarioId
        );

        // ============================
        // Las prendas regresan
        // ============================

        const prendasDespues =
        await prisma.prenda.findMany({
            where: {
            id: {
                in: [
                prendaCamisaId,
                prendaPantalonId,
                ],
            },
            },
        });

        expect(
        prendasDespues
        ).toHaveLength(2);

        for (const prenda of prendasDespues) {
        /*
        * Deben regresar físicamente
        * al almacén original.
        */
        expect(
            prenda.disfrazActualId
        ).toBe(almacenId);

        /*
        * Su hogar nunca debió cambiar.
        */
        expect(
            prenda.disfrazHogarId
        ).toBe(almacenId);

        expect(
            prenda.estado
        ).toBe("DISPONIBLE");
        }

        // ============================
        // Reserva eliminada
        // ============================

        const reservaDespues =
        await prisma.reserva.findUnique({
            where: {
            id: reservaId,
            },
        });

        expect(
        reservaDespues
        ).toBeNull();

        // ============================
        // Movimientos eliminados
        // por cascade
        // ============================

        const movimientosDespues =
        await prisma.movimientoPrenda.count({
            where: {
            reservaId,
            },
        });

        expect(
        movimientosDespues
        ).toBe(0);

        // ============================
        // Disfraz temporal eliminado
        // ============================

        const disfrazDespues =
        await prisma.disfrazFisico.findUnique({
            where: {
            id: disfrazId,
            },
        });

        expect(
        disfrazDespues
        ).toBeNull();

        /*
        * Evitamos que afterAll intente
        * eliminar nuevamente registros
        * que PI-22 ya eliminó.
        */
        reservaCreadaId = null;
        disfrazCreadoId = null;
    }
    );
  }
);