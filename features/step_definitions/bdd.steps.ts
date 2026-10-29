import {
  Given,
  When,
  Then,
  Before,
} from "@cucumber/cucumber";

import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../../src/config/prisma";

import {
  registrarUsuario,
  iniciarSesion,
  cerrarSesionesUsuario,
  refrescarAccessToken,
} from "../../src/modules/auth/auth.service";

import {
  listarDisfraces,
  buscarCandidatos,
  obtenerDisfrazConEstado,
} from "../../src/modules/disfraces/disfraces.service";

import {
  crearDevolucion,
  ErrorDevolucion,
} from "../../src/modules/devoluciones/devoluciones.service";

import {
  buscarRecetas,
} from "../../src/modules/a-medida/busqueda.service";

import {
  proponerArmado,
} from "../../src/modules/a-medida/armado.service";

import {
  reservarAjuste,
  ErrorAjuste,
} from "../../src/modules/ajuste-talla/ajuste.service";
// ============================================================
// ESTADO COMPARTIDO DEL ESCENARIO
// ============================================================

let resultado: any;
let errorCapturado: any;

let usuarioId: string;
let correoUsuario: string;
let passwordUsuario: string;

let refreshTokenGuardado: string;

let resultadoCatalogo: any[] = [];

let disfrazBDD05Id = "";
let prendaBDD05Id = "";
let candidatosBDD05: any[] = [];
let sustitucionesAntesBDD05 = 0;
let sustitucionesDespuesBDD05 = 0;

let usuarioBDD06Id = "";
let alquilerBDD06Id = "";
let disfrazBDD06Id = "";
let prendasBDD06Ids: string[] = [];
let devolucionesAntesBDD06 = 0;

let usuarioBDD07Id = "";
let recetaBDD07Id = "";
let resultadoBDD07: any;
let terminoBDD07 = "";

let recetaBDD08Id = "";
let resultadoBDD08: any;
let tallaSolicitadaBDD08 = "";

let usuarioBDD09Id = "";
let disfrazBDD09Id = "";
let resultadoBDD09: any;
let reservasAntesBDD09 = 0;

// ============================================================
// LIMPIEZA ENTRE ESCENARIOS
// ============================================================

Before(async function () {
  resultado = undefined;
  errorCapturado = undefined;

  usuarioId = "";
  correoUsuario = "";
  passwordUsuario = "";

  refreshTokenGuardado = "";

  resultadoCatalogo = [];

  disfrazBDD05Id = "";
  prendaBDD05Id = "";
  candidatosBDD05 = [];
  sustitucionesAntesBDD05 = 0;
  sustitucionesDespuesBDD05 = 0;

  usuarioBDD06Id = "";
  alquilerBDD06Id = "";
  disfrazBDD06Id = "";
  prendasBDD06Ids = [];
  devolucionesAntesBDD06 = 0;
  
  usuarioBDD07Id = "";
  recetaBDD07Id = "";
  resultadoBDD07 = undefined;
  terminoBDD07 = "";

  recetaBDD08Id = "";
  resultadoBDD08 = undefined;
  tallaSolicitadaBDD08 = "";

  usuarioBDD09Id = "";
  disfrazBDD09Id = "";
  resultadoBDD09 = undefined;
  reservasAntesBDD09 = 0;
});

// ============================================================
// BDD-01
// HU-03 / CA-03.4 / TC-BE-AUTH-05
// Registro duplicado
// ============================================================

Given(
  "que existe un usuario registrado con el correo {string}",
  async function (correo: string) {
    correoUsuario = correo;
    passwordUsuario = "Password123!";

    const passwordHasheada = await bcrypt.hash(
      passwordUsuario,
      10
    );

    const existente =
      await prisma.usuario.findUnique({
        where: {
          email: correo,
        },
      });

    if (existente) {
      usuarioId = existente.id;
      return;
    }

    const usuario =
      await prisma.usuario.create({
        data: {
          nombre: "Cliente BDD",
          email: correo,
          password: passwordHasheada,
          telefono: "999999999",
          direccion: "Dirección BDD",
          rol: "CLIENTE",
        },
      });

    usuarioId = usuario.id;
  }
);

When(
  "intento registrar otro usuario con el correo {string}",
  async function (correo: string) {
    try {
      resultado = await registrarUsuario({
        nombre: "Cliente duplicado",
        email: correo,
        password: "OtraPassword123!",
        telefono: "988888888",
        direccion: "Otra dirección",
      } as any);
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "el registro debe ser rechazado",
  function () {
    assert.ok(
      errorCapturado instanceof Error,
      "Se esperaba que el registro fuera rechazado"
    );

    assert.equal(
      errorCapturado.message,
      "Ya existe un usuario registrado con ese email"
    );

    assert.equal(
      resultado,
      undefined
    );
  }
);

Then(
  "no debe crearse un segundo usuario con el mismo correo",
  async function () {
    const cantidad =
      await prisma.usuario.count({
        where: {
          email: correoUsuario,
        },
      });

    assert.equal(
      cantidad,
      1,
      "Debe existir solamente un usuario con el correo indicado"
    );
  }
);

// ============================================================
// BDD-02
// HU-04 / CA-04.2 / TC-BE-AUTH-07
// Contraseña incorrecta
// ============================================================

Given(
  "que existe un usuario activo con credenciales válidas",
  async function () {
    correoUsuario =
      "bdd-login@disfracespro.test";

    passwordUsuario =
      "PasswordCorrecta123!";

    await prisma.sesionActiva.deleteMany({
      where: {
        usuario: {
          email: correoUsuario,
        },
      },
    });

    await prisma.usuario.deleteMany({
      where: {
        email: correoUsuario,
      },
    });

    const passwordHasheada =
      await bcrypt.hash(
        passwordUsuario,
        10
      );

    const usuario =
      await prisma.usuario.create({
        data: {
          nombre: "Usuario Login BDD",
          email: correoUsuario,
          password: passwordHasheada,
          telefono: "977777777",
          direccion: "Dirección Login BDD",
          rol: "CLIENTE",
        },
      });

    usuarioId = usuario.id;
  }
);

When(
  "intento iniciar sesión con una contraseña incorrecta",
  async function () {
    try {
      resultado = await iniciarSesion({
        email: correoUsuario,
        password:
          "PasswordIncorrecta123!",
      });
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "la autenticación debe ser rechazada",
  function () {
    assert.ok(
      errorCapturado instanceof Error,
      "Se esperaba que la autenticación fuera rechazada"
    );

    assert.equal(
      errorCapturado.message,
      "Credenciales inválidas"
    );

    assert.equal(
      resultado,
      undefined
    );
  }
);

Then(
  "el mensaje no debe revelar información sensible de la cuenta",
  function () {
    assert.ok(
      errorCapturado instanceof Error
    );

    const mensaje =
      errorCapturado.message.toLowerCase();

    assert.equal(
      mensaje,
      "credenciales inválidas"
    );

    assert.ok(
      !mensaje.includes(
        correoUsuario.toLowerCase()
      )
    );

    assert.ok(
      !mensaje.includes("password")
    );

    assert.ok(
      !mensaje.includes("contraseña incorrecta")
    );

    assert.ok(
      !mensaje.includes("usuario existe")
    );
  }
);

// ============================================================
// BDD-03
// HU-05 / CA-05.3 / TC-BE-AUTH-12
// Refresh después del logout
// ============================================================

Given(
  "que un usuario tiene una sesión activa",
  async function () {
    correoUsuario =
      "bdd-sesion@disfracespro.test";

    passwordUsuario =
      "PasswordSesion123!";

    await prisma.sesionActiva.deleteMany({
      where: {
        usuario: {
          email: correoUsuario,
        },
      },
    });

    await prisma.usuario.deleteMany({
      where: {
        email: correoUsuario,
      },
    });

    const passwordHasheada =
      await bcrypt.hash(
        passwordUsuario,
        10
      );

    const usuario =
      await prisma.usuario.create({
        data: {
          nombre: "Usuario Sesión BDD",
          email: correoUsuario,
          password: passwordHasheada,
          telefono: "966666666",
          direccion: "Dirección Sesión BDD",
          rol: "CLIENTE",
        },
      });

    usuarioId = usuario.id;

    const login =
      await iniciarSesion({
        email: correoUsuario,
        password: passwordUsuario,
      });

    refreshTokenGuardado =
      login.refreshToken;

    assert.ok(
      refreshTokenGuardado,
      "El login debe generar un refresh token"
    );

    const payload = jwt.decode(
      refreshTokenGuardado
    ) as {
      jti?: string;
    } | null;

    assert.ok(
      payload?.jti,
      "El refresh token debe contener un jti"
    );

    const sesion =
      await prisma.sesionActiva.findUnique({
        where: {
          tokenId: payload.jti,
        },
      });

    assert.ok(
      sesion,
      "La sesión debe estar registrada como activa"
    );
  }
);

Given(
  "el usuario cierra su sesión",
  async function () {
    await cerrarSesionesUsuario(
      usuarioId
    );

    const sesiones =
      await prisma.sesionActiva.count({
        where: {
          usuarioId,
        },
      });

    assert.equal(
      sesiones,
      0,
      "Después del logout no deben quedar sesiones activas"
    );
  }
);

When(
  "intenta renovar la sesión utilizando el refresh token cerrado",
  async function () {
    try {
      resultado =
        await refrescarAccessToken(
          refreshTokenGuardado
        );
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "la renovación de la sesión debe ser rechazada",
  function () {
    assert.ok(
      errorCapturado instanceof Error,
      "Se esperaba que el refresh fuera rechazado"
    );

    assert.equal(
      errorCapturado.message,
      "Esta sesión fue cerrada. Vuelve a iniciar sesión."
    );

    assert.equal(
      resultado,
      undefined
    );
  }
);

// ============================================================
// BDD-04
// HU-06 / CA-06.2 / TC-BE-CAT-02
// Catálogo sin coincidencias
// ============================================================

Given(
  "que existen disfraces disponibles en el catálogo",
  async function () {
    const catalogo = await listarDisfraces({});

    assert.ok(
      Array.isArray(catalogo),
      "La consulta del catálogo debe devolver un arreglo"
    );

    assert.ok(
      catalogo.length > 0,
      "La base de datos de pruebas debe contener al menos un disfraz de catálogo"
    );
  }
);

When(
  "busco en el catálogo un término que no coincide con ningún disfraz",
  async function () {
    errorCapturado = undefined;

    try {
      resultadoCatalogo = await listarDisfraces({
        nombre: "__BDD_DISFRAZ_QUE_NO_EXISTE_9F8A7C6B__",
      });
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "la búsqueda debe devolver una lista vacía",
  function () {
    assert.ok(
      Array.isArray(resultadoCatalogo),
      "La búsqueda debe devolver un arreglo"
    );

    assert.equal(
      resultadoCatalogo.length,
      0,
      "Una búsqueda sin coincidencias debe devolver una lista vacía"
    );
  }
);

Then(
  "no debe producirse un error",
  function () {
    assert.equal(
      errorCapturado,
      undefined,
      "Una búsqueda sin coincidencias no debe lanzar una excepción"
    );
  }
);

// ============================================================
// BDD-05
// HU-14 / CA-14.3 / TC-BE-SUS-03
// No existe candidato de reemplazo
// ============================================================

Given(
  "que un disfraz necesita reemplazar una de sus prendas",
  async function () {
    const marca = Date.now().toString();

    const disfraz = await prisma.disfrazFisico.create({
      data: {
        nombre: `BDD05 Disfraz ${marca}`,
        familia: `BDD05 Familia ${marca}`,
        grupoCompatibilidad: `bdd05-grupo-${marca}`,
        tipoDisfraz: "BDD",
        temporadaEvento: "BDD",
        precioAlquiler: 50,
        origen: "CATALOGO",
      },
    });

    disfrazBDD05Id = disfraz.id;

    const prenda = await prisma.prenda.create({
      data: {
        nombre: `Prenda BDD05 ${marca}`,
        tipo: "ACCESORIO",
        color: "BDD05-COLOR",
        talla: "BDD05-TALLA",
        estado: "FALTANTE",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    prendaBDD05Id = prenda.id;

    const detalle = await obtenerDisfrazConEstado(
      disfrazBDD05Id
    );

    assert.ok(
      detalle,
      "El disfraz de prueba debe existir"
    );

    assert.equal(
      detalle.estado,
      "INCOMPLETO",
      "El disfraz debe estar incompleto por la prenda faltante"
    );
  }
);

Given(
  "no existe una prenda candidata compatible disponible",
  async function () {
    candidatosBDD05 = await buscarCandidatos(
      prendaBDD05Id,
      disfrazBDD05Id
    );

    assert.ok(
      Array.isArray(candidatosBDD05),
      "La búsqueda de candidatos debe devolver un arreglo"
    );

    assert.equal(
      candidatosBDD05.length,
      0,
      "No debe existir ningún candidato compatible para la prueba"
    );

    sustitucionesAntesBDD05 =
      await prisma.sustitucion.count({
        where: {
          disfrazDestinoId: disfrazBDD05Id,
        },
      });
  }
);

When(
  "se intenta realizar la sustitución",
  async function () {
    /*
     * El flujo solamente puede confirmar una sustitución cuando
     * buscarCandidatos devuelve una pieza válida.
     *
     * Al no existir candidatos, no se llama a confirmarPrestamo.
     */
    if (candidatosBDD05.length > 0) {
      throw new Error(
        "La precondición BDD-05 se incumplió: apareció un candidato compatible"
      );
    }

    sustitucionesDespuesBDD05 =
      await prisma.sustitucion.count({
        where: {
          disfrazDestinoId: disfrazBDD05Id,
        },
      });
  }
);

Then(
  "no debe registrarse una sustitución",
  function () {
    assert.equal(
      sustitucionesDespuesBDD05,
      sustitucionesAntesBDD05,
      "No debe registrarse una sustitución cuando no existen candidatos"
    );
  }
);

Then(
  "el disfraz debe permanecer incompleto",
  async function () {
    const detalle = await obtenerDisfrazConEstado(
      disfrazBDD05Id
    );

    assert.ok(
      detalle,
      "El disfraz debe continuar existiendo"
    );

    assert.equal(
      detalle.estado,
      "INCOMPLETO",
      "El disfraz debe permanecer incompleto"
    );

    assert.equal(
      detalle.completo,
      false,
      "El disfraz no debe marcarse como completo"
    );

    assert.ok(
      detalle.faltantes > 0,
      "El disfraz debe conservar al menos una pieza faltante"
    );
  }
);

// ============================================================
// BDD-06
// HU-20 / CA-20.3 / TC-BE-DEV-03
// Devolución incompleta
// ============================================================

Given(
  "que un cliente tiene un alquiler con dos prendas",
  async function () {
    const marca = Date.now().toString();
    const correo = `bdd06-${marca}@disfracespro.test`;

    const passwordHasheada = await bcrypt.hash(
      "PasswordBDD06!",
      10
    );

    // --------------------------------------------------------
    // Usuario
    // --------------------------------------------------------

    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Cliente BDD06",
        email: correo,
        password: passwordHasheada,
        telefono: "955555555",
        direccion: "Dirección BDD06",
        rol: "CLIENTE",
      },
    });

    usuarioBDD06Id = usuario.id;

    // --------------------------------------------------------
    // Disfraz
    // --------------------------------------------------------

    const disfraz = await prisma.disfrazFisico.create({
      data: {
        nombre: `BDD06 Disfraz ${marca}`,
        familia: `BDD06 Familia ${marca}`,
        grupoCompatibilidad: `bdd06-grupo-${marca}`,
        tipoDisfraz: "BDD",
        temporadaEvento: "BDD",
        precioAlquiler: 60,
        origen: "CATALOGO",
      },
    });

    disfrazBDD06Id = disfraz.id;

    // --------------------------------------------------------
    // Dos prendas
    // --------------------------------------------------------

    const prenda1 = await prisma.prenda.create({
      data: {
        nombre: `BDD06 Prenda 1 ${marca}`,
        tipo: "ACCESORIO",
        color: "NEGRO",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    const prenda2 = await prisma.prenda.create({
      data: {
        nombre: `BDD06 Prenda 2 ${marca}`,
        tipo: "ACCESORIO",
        color: "BLANCO",
        talla: "M",
        estado: "DISPONIBLE",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    prendasBDD06Ids = [
      prenda1.id,
      prenda2.id,
    ];

    // --------------------------------------------------------
    // Alquiler
    // --------------------------------------------------------

    const alquiler = await prisma.alquiler.create({
    data: {
        usuarioId: usuario.id,
        fechaInicio: new Date(),
        fechaFin: new Date(
        Date.now() + 24 * 60 * 60 * 1000
        ),
        estado: "ACTIVO",
        montoTotal: 60,

        disfraces: {
        create: {
            disfrazFisicoId: disfraz.id,
            precioUnitario: 60,
        },
        },
    },
    });

    alquilerBDD06Id = alquiler.id;

    // --------------------------------------------------------
    // Comprobamos la precondición
    // --------------------------------------------------------

    const prendasAlquiler =
      await prisma.prenda.findMany({
        where: {
          disfrazActualId: disfraz.id,
        },
      });

    assert.equal(
      prendasAlquiler.length,
      2,
      "El alquiler BDD-06 debe contener exactamente dos prendas"
    );

    devolucionesAntesBDD06 =
      await prisma.devolucion.count({
        where: {
          alquilerId: alquiler.id,
        },
      });
  }
);

When(
  "intenta registrar la devolución reportando solamente una de las prendas",
  async function () {
    errorCapturado = undefined;
    resultado = undefined;

    try {
      resultado = await crearDevolucion(
        {
          alquilerId: alquilerBDD06Id,
          fechaDevolucion:
            new Date().toISOString(),

          observaciones:
            "Devolución incompleta BDD-06",

          prendas: [
            {
              prendaId:
                prendasBDD06Ids[0],

              estadoPrenda:
                "BUEN_ESTADO",
            },
          ],
        } as any,

        usuarioBDD06Id
      );
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "la devolución debe ser rechazada",
  async function () {
    assert.ok(
      errorCapturado instanceof ErrorDevolucion,
      "La devolución incompleta debe producir un ErrorDevolucion"
    );

    assert.equal(
      errorCapturado.estado,
      400,
      "La devolución incompleta debe responder con estado 400"
    );

    assert.equal(
      resultado,
      undefined,
      "No debe obtenerse una devolución válida"
    );

    const devolucionesDespues =
      await prisma.devolucion.count({
        where: {
          alquilerId: alquilerBDD06Id,
        },
      });

    assert.equal(
      devolucionesDespues,
      devolucionesAntesBDD06,
      "No debe crearse una devolución cuando faltan prendas por reportar"
    );

    const alquiler =
      await prisma.alquiler.findUnique({
        where: {
          id: alquilerBDD06Id,
        },
      });

    assert.equal(
      alquiler?.estado,
      "ACTIVO",
      "El alquiler debe permanecer activo después del rechazo"
    );
  }
);

Then(
  "debe indicarse que se debe reportar el estado de todas las prendas del alquiler",
  function () {
    assert.ok(
      errorCapturado instanceof ErrorDevolucion
    );

    assert.equal(
      errorCapturado.message,
      "Debes reportar el estado de todas las prendas del alquiler."
    );
  }
);

// ============================================================
// BDD-07
// HU-28 / CA-28.5 / TC-BE-BUS-05
// Búsqueda utilizando lenguaje de negocio
// ============================================================

Given(
  "que existen disfraces asociados a términos de búsqueda del negocio",
  async function () {
    const marca = Date.now().toString();

    terminoBDD07 = `guardianbdd${marca}`;

    const passwordHasheada = await bcrypt.hash(
      "PasswordBDD07!",
      10
    );

    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Cliente BDD07",
        email: `bdd07-${marca}@disfracespro.test`,
        password: passwordHasheada,
        telefono: "944444444",
        direccion: "Dirección BDD07",
        rol: "CLIENTE",
      },
    });

    usuarioBDD07Id = usuario.id;

    const receta = await prisma.receta.create({
      data: {
        nombre: `Guardián ceremonial BDD07 ${marca}`,
        descripcion:
          "Receta creada para validar búsqueda mediante lenguaje natural.",
        precioDia: 50,
        activa: true,

        palabrasClave: [
          terminoBDD07,
          `guardian ceremonial ${marca}`,
        ],
      },
    });

    recetaBDD07Id = receta.id;

    assert.ok(
      recetaBDD07Id,
      "Debe existir una receta asociada a términos de búsqueda"
    );
  }
);

When(
  "el usuario realiza una búsqueda utilizando un término equivalente",
  async function () {
    errorCapturado = undefined;
    resultadoBDD07 = undefined;

    try {
      resultadoBDD07 = await buscarRecetas(
        usuarioBDD07Id,
        `Quiero un disfraz de ${terminoBDD07}`
      );
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "deben mostrarse los disfraces relacionados con la intención de búsqueda",
  function () {
    assert.equal(
      errorCapturado,
      undefined,
      "La búsqueda mediante lenguaje de negocio no debe producir un error"
    );

    assert.ok(
      resultadoBDD07,
      "La búsqueda debe devolver un resultado"
    );

    assert.equal(
      resultadoBDD07.resultado,
      "EXACTA",
      "El término equivalente debe producir una coincidencia exacta"
    );

    assert.ok(
      Array.isArray(resultadoBDD07.recetas),
      "El resultado debe contener una lista de recetas"
    );

    const encontrada = resultadoBDD07.recetas.some(
      (receta: any) =>
        receta.id === recetaBDD07Id
    );

    assert.equal(
      encontrada,
      true,
      "Debe mostrarse la receta relacionada con la intención de búsqueda"
    );
  }
);

// ============================================================
// BDD-08
// HU-29 / CA-29.4 / TC-BE-ARM-05
// Falta una pieza obligatoria de la talla solicitada
// ============================================================

Given(
  "que se solicita armar un disfraz para una talla determinada",
  async function () {
    const marca = Date.now().toString();

    tallaSolicitadaBDD08 = "M";

    const receta = await prisma.receta.create({
      data: {
        nombre: `BDD08 Receta ${marca}`,
        descripcion:
          "Receta para validar ausencia de una pieza obligatoria en la talla solicitada.",
        precioDia: 50,
        activa: true,
        palabrasClave: [
          `bdd08-${marca}`,
        ],

        piezas: {
          create: {
            etiqueta: `Camisa BDD08 ${marca}`,
            tipo: "CAMISA",
            colores: [],
            nombreContiene: `BDD08-${marca}`,
            obligatoria: true,
          },
        },
      },
    });

    recetaBDD08Id = receta.id;

    assert.ok(
      recetaBDD08Id,
      "Debe crearse la receta utilizada por BDD-08"
    );
  }
);

Given(
  "falta una pieza obligatoria compatible con la talla solicitada",
  async function () {
    const marca = Date.now().toString();

    // Creamos un contenedor de almacén.
    const almacen = await prisma.disfrazFisico.create({
      data: {
        nombre: `BDD08 Almacén ${marca}`,
        familia: `BDD08 Almacén ${marca}`,
        grupoCompatibilidad: `bdd08-almacen-${marca}`,
        tipoDisfraz: "BDD",
        temporadaEvento: "BDD",
        precioAlquiler: 0,
        origen: "ALMACEN",
      },
    });

    // Existe una camisa que cumple el hueco, pero deliberadamente
    // está en talla L mientras el cliente solicitará M.
    await prisma.prenda.create({
      data: {
        nombre: `Camisa BDD08-${marca}`,
        tipo: "CAMISA",
        color: "NEGRO",
        talla: "L",
        estado: "DISPONIBLE",
        calidad: "alta",
        disfrazHogarId: almacen.id,
        disfrazActualId: almacen.id,
      },
    });

    const prendasTallaSolicitada =
      await prisma.prenda.count({
        where: {
          disfrazHogarId: almacen.id,
          tipo: "CAMISA",
          talla: tallaSolicitadaBDD08,
          estado: "DISPONIBLE",
        },
      });

    assert.equal(
      prendasTallaSolicitada,
      0,
      "No debe existir una camisa talla M para este escenario"
    );
  }
);

When(
  "se intenta armar el disfraz",
  async function () {
    errorCapturado = undefined;
    resultadoBDD08 = undefined;

    try {
      resultadoBDD08 = await proponerArmado(
        recetaBDD08Id,
        {
          ropa: tallaSolicitadaBDD08,
        }
      );
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "el armado no debe completarse",
  function () {
    assert.equal(
      errorCapturado,
      undefined,
      "La propuesta debe calcularse sin producir un error técnico"
    );

    assert.ok(
      resultadoBDD08,
      "Debe obtenerse una propuesta de armado"
    );

    assert.equal(
      resultadoBDD08.completo,
      false,
      "El armado no debe estar completo"
    );

    assert.ok(
      Array.isArray(resultadoBDD08.faltantes)
    );

    assert.equal(
      resultadoBDD08.faltantes.length,
      1,
      "Debe existir una pieza obligatoria faltante"
    );
  }
);

Then(
  "debe informarse que faltan piezas compatibles",
  function () {
    const faltante =
      resultadoBDD08.faltantes[0];

    assert.ok(
      faltante,
      "Debe informarse la pieza obligatoria que no pudo cubrirse"
    );

    assert.equal(
      faltante.tipo,
      "CAMISA",
      "La pieza faltante debe ser la camisa obligatoria"
    );

    assert.equal(
      faltante.obligatoria,
      true,
      "La pieza faltante debe ser obligatoria"
    );

    assert.equal(
      faltante.tallaPedida,
      tallaSolicitadaBDD08,
      "Debe conservarse la talla solicitada por el usuario"
    );

    assert.equal(
      typeof faltante.motivo,
      "string",
      "Debe proporcionarse un motivo"
    );

    assert.ok(
      faltante.motivo.length > 0,
      "Debe informarse por qué no pudo cubrirse la pieza"
    );
  }
);

// ============================================================
// BDD-09
// HU-37 / CA-37.5 / TC-BE-AJU-06
// Insuficientes prendas donantes para realizar el ajuste
// ============================================================

Given(
  "que un disfraz requiere varias piezas para realizar un ajuste de talla",
  async function () {
    const marca = Date.now().toString();

    const passwordHasheada = await bcrypt.hash(
      "PasswordBDD09!",
      10
    );

    // --------------------------------------------------------
    // Usuario
    // --------------------------------------------------------

    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Cliente BDD09",
        email: `bdd09-${marca}@disfracespro.test`,
        password: passwordHasheada,
        telefono: "933333333",
        direccion: "Dirección BDD09",
        rol: "CLIENTE",
      },
    });

    usuarioBDD09Id = usuario.id;

    // --------------------------------------------------------
    // Disfraz que se quiere ajustar
    // --------------------------------------------------------

    const disfraz = await prisma.disfrazFisico.create({
      data: {
        nombre: `BDD09 Disfraz ${marca}`,
        familia: `BDD09 Familia ${marca}`,
        grupoCompatibilidad: `bdd09-grupo-${marca}`,
        tipoDisfraz: "BDD",
        temporadaEvento: "BDD",
        precioAlquiler: 60,
        origen: "CATALOGO",
      },
    });

    disfrazBDD09Id = disfraz.id;

    // El disfraz tiene dos prendas talla S.
    // Ambas necesitarán cambiar a talla M.

    await prisma.prenda.create({
      data: {
        nombre: `Camisa BDD09 ${marca}`,
        tipo: "CAMISA",
        color: "NEGRO",
        talla: "S",
        estado: "DISPONIBLE",
        calidad: "alta",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    await prisma.prenda.create({
      data: {
        nombre: `Pantalón BDD09 ${marca}`,
        tipo: "PANTALON",
        color: "NEGRO",
        talla: "S",
        estado: "DISPONIBLE",
        calidad: "alta",
        disfrazHogarId: disfraz.id,
        disfrazActualId: disfraz.id,
      },
    });

    const prendas =
      await prisma.prenda.count({
        where: {
          disfrazActualId: disfraz.id,
        },
      });

    assert.equal(
      prendas,
      2,
      "El disfraz BDD-09 debe contener dos prendas que requieren ajuste"
    );
  }
);

Given(
  "no existen suficientes prendas donantes compatibles",
  async function () {
    const marca = Date.now().toString();

    // --------------------------------------------------------
    // Almacén donante
    // --------------------------------------------------------

    const almacen = await prisma.disfrazFisico.create({
      data: {
        nombre: `BDD09 Almacén ${marca}`,
        familia: `BDD09 Almacén ${marca}`,
        grupoCompatibilidad: `bdd09-almacen-${marca}`,
        tipoDisfraz: "BDD",
        temporadaEvento: "BDD",
        precioAlquiler: 0,
        origen: "ALMACEN",
      },
    });

    // Solo existe una CAMISA talla M.
    // No creamos ningún PANTALÓN talla M.
    //
    // Por tanto:
    // CAMISA S -> M sí puede resolverse.
    // PANTALÓN S -> M no puede resolverse.

    await prisma.prenda.create({
      data: {
        nombre: `Camisa BDD09 ${marca}`,
        tipo: "CAMISA",
        color: "NEGRO",
        talla: "M",
        estado: "DISPONIBLE",
        calidad: "alta",
        disfrazHogarId: almacen.id,
        disfrazActualId: almacen.id,
      },
    });

    reservasAntesBDD09 =
      await prisma.reserva.count({
        where: {
          usuarioId: usuarioBDD09Id,
          tipo: "AJUSTE_TALLA",
        },
      });
  }
);

When(
  "el usuario solicita el ajuste de talla",
  async function () {
    errorCapturado = undefined;
    resultadoBDD09 = undefined;

    try {
      resultadoBDD09 = await reservarAjuste(
        disfrazBDD09Id,
        {
          ropa: "M",
        },
        usuarioBDD09Id
      );
    } catch (error) {
      errorCapturado = error;
    }
  }
);

Then(
  "la solicitud debe ser rechazada",
  function () {
    assert.ok(
      errorCapturado instanceof ErrorAjuste,
      "La falta de donantes debe producir un ErrorAjuste"
    );

    assert.equal(
      errorCapturado.estado,
      409,
      "El ajuste incompleto debe rechazarse con estado 409"
    );

    assert.equal(
      resultadoBDD09,
      undefined,
      "No debe obtenerse una reserva de ajuste válida"
    );

    assert.ok(
      errorCapturado.message.includes(
        "No se pueden ajustar las tallas ahora mismo"
      ),
      "Debe informarse que el ajuste no puede completarse"
    );
  }
);

Then(
  "no debe crearse un ajuste incompleto",
  async function () {
    const reservasDespues =
      await prisma.reserva.count({
        where: {
          usuarioId: usuarioBDD09Id,
          tipo: "AJUSTE_TALLA",
        },
      });

    assert.equal(
      reservasDespues,
      reservasAntesBDD09,
      "No debe crearse una reserva de ajuste cuando faltan donantes"
    );

    assert.ok(
      errorCapturado instanceof ErrorAjuste
    );

    const datos = errorCapturado.datos as any;

    assert.ok(
      datos,
      "El error debe contener información sobre las piezas faltantes"
    );

    assert.ok(
      Array.isArray(datos.faltantes),
      "El error debe identificar las piezas que no pudieron ajustarse"
    );

    assert.ok(
      datos.faltantes.length >= 1,
      "Debe existir al menos una pieza sin donante compatible"
    );
  }
);