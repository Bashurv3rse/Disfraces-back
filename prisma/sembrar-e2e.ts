import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "cliente-pife05@test.com";
const PASSWORD = "PruebaE2E#2026";
const NOMBRE_DISFRAZ = "Disfraz Catálogo E2E";

async function main() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "El seed E2E solo puede ejecutarse con NODE_ENV=test."
    );
  }

  const databaseUrl =
    process.env.DATABASE_URL ?? "";

  if (new URL(databaseUrl).pathname !== "/disfraz_test_db") {
    throw new Error(
      "DATABASE_URL no apunta a disfraz_test_db. Seed cancelado por seguridad."
    );
  }

  // =====================================
  // 1. Disfraz de catálogo
  // =====================================

  let disfraz =
    await prisma.disfrazFisico.findFirst({
      where: {
        nombre: NOMBRE_DISFRAZ,
        origen: "CATALOGO",
      },
    });

  if (!disfraz) {
    disfraz =
      await prisma.disfrazFisico.create({
        data: {
          nombre: NOMBRE_DISFRAZ,
          familia: "Integración",
          tipoDisfraz: "Prueba E2E",
          temporadaEvento: "integracion",
          precioAlquiler: 40,
          origen: "CATALOGO",
        },
      });

    await prisma.prenda.create({
      data: {
        nombre: "Camisa E2E",
        tipo: "CAMISA",
        color: "azul",
        talla: "M",
        calidad: "bueno",
        estado: "DISPONIBLE",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    console.log(
      `Disfraz E2E creado: ${disfraz.id}`
    );
  } else {
    console.log(
      `Disfraz E2E ya existente: ${disfraz.id}`
    );
  }

  // =====================================
  // 2. Usuario cliente para PI-FE-05
  // =====================================

  const passwordHash =
    await bcrypt.hash(PASSWORD, 10);

  let usuario =
    await prisma.usuario.findUnique({
      where: {
        email: EMAIL,
      },
    });

  if (!usuario) {
    usuario =
      await prisma.usuario.create({
        data: {
          nombre: "Cliente PI-FE-05",
          email: EMAIL,
          password: passwordHash,
          telefono: "977777777",
          direccion: "Dirección E2E",
          rol: "CLIENTE",
        },
      });

    console.log(
      `Usuario E2E creado: ${usuario.id}`
    );
  } else {
    // Garantiza que la contraseña conocida
    // siga funcionando entre ejecuciones.
    await prisma.usuario.update({
      where: {
        id: usuario.id,
      },
      data: {
        password: passwordHash,
      },
    });

    console.log(
      `Usuario E2E ya existente: ${usuario.id}`
    );
  }

  // =====================================
  // 3. Evitar alquileres duplicados
  // =====================================

  const alquilerExistente =
    await prisma.alquiler.findFirst({
      where: {
        usuarioId: usuario.id,
        evento: "Evento Integración E2E",
        estado: "ACTIVO",
      },
    });

  const fechaInicio = new Date();
  const fechaFin = new Date(fechaInicio);
  fechaFin.setDate(fechaFin.getDate() + 2);

  if (alquilerExistente) {
    // Mantener reproducible el fixture entre ejecuciones: 2 × 40 + 25% = 100.
    await prisma.alquiler.update({
      where: { id: alquilerExistente.id },
      data: { fechaInicio, fechaFin, montoTotal: 80, montoGarantia: 20, descuento: 0 },
    });
    console.log(
      `Alquiler E2E ya existente: ${alquilerExistente.id}`
    );

    return;
  }

  // =====================================
  // 4. Crear alquiler real en PostgreSQL
  // =====================================

  const alquiler =
    await prisma.alquiler.create({
      data: {
        usuarioId: usuario.id,
        fechaInicio,
        fechaFin,
        evento: "Evento Integración E2E",
        estado: "ACTIVO",

        // 2 días × S/ 40
        montoTotal: 80,

        descuento: 0,

        // 25% de S/ 80
        montoGarantia: 20,

        disfraces: {
          create: [
            {
              disfrazFisicoId:
                disfraz.id,

              precioUnitario: 40,
            },
          ],
        },
      },
      include: {
        disfraces: true,
      },
    });

  console.log(
    `Alquiler E2E creado: ${alquiler.id}`
  );

  console.log(
    "Preparación PI-FE-05 completada."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
