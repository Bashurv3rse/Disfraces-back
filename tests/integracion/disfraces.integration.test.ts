
import { randomUUID } from "crypto";

import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../../src/config/prisma";

import {
  crearDisfraz,
  listarDisfraces,
  obtenerDisfrazConEstado,
  obtenerTemporadasDisponibles,
  obtenerTiposDisponibles,
  ErrorDisfraz,
  actualizarPrenda,
  actualizarEstadoManual,
  obtenerDetalleInventario,
  buscarCandidatos,
  confirmarPrestamo,
  devolverPrestamo,
  limpiarSuspensionesVencidas,
} from "../../src/modules/disfraces/disfraces.service";

import { crearDisfrazSchema } from "../../src/modules/disfraces/disfraces.schema";

describe("Pruebas de integración - catálogo de disfraces", () => {
  const prefijo = `PI-CAT-${randomUUID().slice(0, 8)}`;

  const idsCreados: string[] = [];

  function datosDisfraz(
    nombre: string,
    opciones: {
      tipoDisfraz?: string;
      temporadaEvento?: string;
      precioAlquiler?: number;
    } = {}
  ) {
    return crearDisfrazSchema.parse({
      nombre: `${prefijo}-${nombre}`,
      familia: `${prefijo}-${nombre}`,
      tipoDisfraz: opciones.tipoDisfraz ?? "Fantasia",
      temporadaEvento: opciones.temporadaEvento ?? "Halloween",
      precioAlquiler: opciones.precioAlquiler ?? 45,
      prendas: [
        {
          nombre: "Camisa de prueba",
          tipo: "CAMISA",
          color: "Rojo",
          talla: "M",
        },
        {
          nombre: "Pantalón de prueba",
          tipo: "PANTALON",
          color: "Negro",
          talla: "M",
        },
      ],
    });
  }

    function restarDiasHabiles(fecha: Date, cantidad: number): Date {
    const resultado = new Date(fecha);
    resultado.setUTCHours(12, 0, 0, 0);

    let descontados = 0;

    while (descontados < cantidad) {
        resultado.setUTCDate(resultado.getUTCDate() - 1);

        const dia = resultado.getUTCDay();

        if (dia !== 0 && dia !== 6) {
        descontados++;
        }
    }

    return resultado;
    }

    async function suspenderDisfraz(
    disfrazId: string,
    fechaSuspension: Date
    ) {
    await prisma.disfrazFisico.update({
        where: { id: disfrazId },
        data: {
        estadoManual: "SUSPENDIDO",
        fechaSuspension,
        },
    });
    }
  async function crearDisfrazPrueba(
    nombre: string,
    opciones: Parameters<typeof datosDisfraz>[1] = {}
  ) {
    const disfraz = await crearDisfraz(
      datosDisfraz(nombre, opciones)
    );

    expect(disfraz).not.toBeNull();

    idsCreados.push(disfraz!.id);

    return disfraz!;
  }

    async function limpiarDatos() {
    if (idsCreados.length === 0) return;

    const ids = [...idsCreados];

    await prisma.sustitucion.deleteMany({
        where: {
        OR: [
            { disfrazOrigenId: { in: ids } },
            { disfrazDestinoId: { in: ids } },
        ],
        },
    });

    await prisma.prenda.deleteMany({
        where: {
        disfrazHogarId: { in: ids },
        },
    });

    await prisma.disfrazFisico.deleteMany({
        where: {
        id: { in: ids },
        },
    });

    idsCreados.length = 0;
    }

  beforeEach(async () => {
    await limpiarDatos();
  });

  afterAll(async () => {
    await limpiarDatos();
    await prisma.$disconnect();
  });

  it("TC-BE-INV-01: crea un disfraz y sus prendas en PostgreSQL", async () => {
    const disfraz = await crearDisfrazPrueba("creacion");

    const registro = await prisma.disfrazFisico.findUnique({
      where: { id: disfraz.id },
      include: {
        prendasHogar: true,
      },
    });

    expect(registro).not.toBeNull();
    expect(registro!.nombre).toBe(`${prefijo}-creacion`);
    expect(registro!.precioAlquiler.toNumber()).toBe(45);
    expect(registro!.prendasHogar).toHaveLength(2);

    expect(
      registro!.prendasHogar.map((p) => p.tipo)
    ).toEqual(
      expect.arrayContaining(["CAMISA", "PANTALON"])
    );

    for (const prenda of registro!.prendasHogar) {
      expect(prenda.disfrazHogarId).toBe(disfraz.id);
      expect(prenda.disfrazActualId).toBe(disfraz.id);
      expect(prenda.talla).toBe("M");
      expect(prenda.estado).toBe("DISPONIBLE");
      expect(prenda.color).toBe(prenda.tipo === "CAMISA" ? "Rojo" : "Negro");
    }
  });

  it("PI-CAT-02: rechaza nombres duplicados sin crear registros adicionales", async () => {
    const datos = datosDisfraz("duplicado");

    const primero = await crearDisfraz(datos);
    expect(primero).not.toBeNull();

    idsCreados.push(primero!.id);

    const cantidadAntes = await prisma.disfrazFisico.count({
      where: { nombre: datos.nombre },
    });

    await expect(
      crearDisfraz(datos)
    ).rejects.toMatchObject({
      estado: 409,
    });

    const cantidadDespues = await prisma.disfrazFisico.count({
      where: { nombre: datos.nombre },
    });

    expect(cantidadAntes).toBe(1);
    expect(cantidadDespues).toBe(1);
  });

  it("PI-CAT-03: consulta el disfraz y calcula su disponibilidad", async () => {
    const creado = await crearDisfrazPrueba("consulta");

    const encontrado = await obtenerDisfrazConEstado(
      creado.id
    );

    expect(encontrado).not.toBeNull();
    expect(encontrado!.id).toBe(creado.id);
    expect(encontrado!.estado).toBe("DISPONIBLE");
    expect(encontrado!.completo).toBe(true);
    expect(encontrado!.faltantes).toBe(0);
    expect(encontrado!.prendasHogar).toHaveLength(2);
  });

  it("PI-CAT-04: filtra disfraces por nombre", async () => {
    const esperado = await crearDisfrazPrueba(
      "nombre-especial"
    );

    await crearDisfrazPrueba("nombre-distinto");

    const resultados = await listarDisfraces({
      nombre: `${prefijo}-nombre-especial`,
    });

    expect(
      resultados.some((d) => d.id === esperado.id)
    ).toBe(true);

    expect(
      resultados.every((d) =>
        d.nombre.toLowerCase().includes(
          `${prefijo}-nombre-especial`.toLowerCase()
        )
      )
    ).toBe(true);
  });

  it("PI-CAT-05: filtra disfraces por temporada y tipo", async () => {
    const esperado = await crearDisfrazPrueba(
      "temporada",
      {
        temporadaEvento: "Navidad",
        tipoDisfraz: "Historico",
      }
    );

    await crearDisfrazPrueba("otro-evento", {
      temporadaEvento: "Halloween",
      tipoDisfraz: "Fantasia",
    });

    const resultados = await listarDisfraces({
      temporadas: ["navidad"],
      tipos: ["Historico"],
    });

    expect(
      resultados.some((d) => d.id === esperado.id)
    ).toBe(true);

    expect(
      resultados.every(
        (d) =>
          d.temporadaEvento === "navidad" &&
          d.tipoDisfraz === "Historico"
      )
    ).toBe(true);
  });

  it("PI-CAT-06: obtiene las temporadas y tipos disponibles desde PostgreSQL", async () => {
    await crearDisfrazPrueba("opciones", {
      temporadaEvento: "Carnaval",
      tipoDisfraz: "Tradicional",
    });

    const temporadas = await obtenerTemporadasDisponibles();
    const tipos = await obtenerTiposDisponibles();

    expect(temporadas).toContain("carnaval");
    expect(tipos).toContain("Tradicional");
  });

  it("PI-CAT-07: devuelve null cuando el disfraz consultado no existe", async () => {
    const resultado = await obtenerDisfrazConEstado(
      randomUUID()
    );

    expect(resultado).toBeNull();
  });


    it("TC-BE-INV-03: una prenda dañada vuelve incompleto al disfraz", async () => {
    const disfraz = await crearDisfrazPrueba("inventario-danado");

    const prenda = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: disfraz.id },
    });

    await actualizarPrenda(prenda.id, { estado: "DANADA" });

    const actualizado = await obtenerDisfrazConEstado(disfraz.id);

    expect(actualizado?.estado).toBe("INCOMPLETO");
    expect(actualizado?.completo).toBe(false);
    expect(actualizado?.faltantes).toBe(1);

    const registro = await prisma.prenda.findUnique({
        where: { id: prenda.id },
    });

    expect(registro?.estado).toBe("DANADA");
    await actualizarPrenda(prenda.id, { estado: "DISPONIBLE" });
    expect(await obtenerDisfrazConEstado(disfraz.id)).toMatchObject({
      estado: "DISPONIBLE", completo: true, faltantes: 0,
    });
    });

    it("PI-INV-02: una prenda faltante vuelve incompleto al disfraz", async () => {
    const disfraz = await crearDisfrazPrueba("inventario-faltante");

    const prenda = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: disfraz.id },
    });

    await actualizarPrenda(prenda.id, { estado: "FALTANTE" });

    const actualizado = await obtenerDisfrazConEstado(disfraz.id);

    expect(actualizado?.estado).toBe("INCOMPLETO");
    expect(actualizado?.completo).toBe(false);
    expect(actualizado?.faltantes).toBe(1);
    });

    it("PI-INV-03: restaurar una prenda devuelve la disponibilidad del disfraz", async () => {
    const disfraz = await crearDisfrazPrueba("inventario-restauracion");

    const prenda = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: disfraz.id },
    });

    await actualizarPrenda(prenda.id, { estado: "DANADA" });

    const estadoAnterior = await obtenerDisfrazConEstado(disfraz.id);

    expect(estadoAnterior?.estado).toBe("INCOMPLETO");

    await actualizarPrenda(prenda.id, { estado: "DISPONIBLE" });

    const estadoPosterior = await obtenerDisfrazConEstado(disfraz.id);

    expect(estadoPosterior?.estado).toBe("DISPONIBLE");
    expect(estadoPosterior?.completo).toBe(true);
    expect(estadoPosterior?.faltantes).toBe(0);
    });

    it("PI-INV-04: el detalle del inventario refleja el estado de las prendas", async () => {
    const disfraz = await crearDisfrazPrueba("inventario-detalle");

    const prendas = await prisma.prenda.findMany({
        where: { disfrazHogarId: disfraz.id },
        orderBy: { tipo: "asc" },
    });

    expect(prendas).toHaveLength(2);

    await actualizarPrenda(prendas[0].id, { estado: "DANADA" });
    await actualizarPrenda(prendas[1].id, { estado: "FALTANTE" });

    const detalle = await obtenerDetalleInventario(disfraz.id);

    expect(detalle).not.toBeNull();
    expect(detalle?.estado).toBe("INCOMPLETO");
    expect(detalle?.faltantes).toBe(2);

    const danada = detalle?.prendas.find(
        (p) => p.id === prendas[0].id
    );

    const faltante = detalle?.prendas.find(
        (p) => p.id === prendas[1].id
    );

    expect(danada?.situacion).toBe("DANADA");
    expect(faltante?.situacion).toBe("FALTANTE");
    });

    it("PI-INV-05: cambiar el estado manual a reparación se refleja en PostgreSQL", async () => {
    const disfraz = await crearDisfrazPrueba("inventario-reparacion");

    await actualizarEstadoManual(disfraz.id, "EN_REPARACION");

    const registro = await prisma.disfrazFisico.findUnique({
        where: { id: disfraz.id },
    });

    expect(registro?.estadoManual).toBe("EN_REPARACION");

    const actualizado = await obtenerDisfrazConEstado(disfraz.id);

    expect(actualizado?.estado).toBe("EN_REPARACION");
    expect(actualizado?.faseLavado).toBeNull();
    });


    it("PI-SUS-01: encuentra prendas compatibles para reemplazar una dañada", async () => {
    const necesitado = await crearDisfrazPrueba("sus-necesitado");
    const donante = await crearDisfrazPrueba("sus-donante");

    // Ambos disfraces deben compartir grupo de compatibilidad.
    await prisma.disfrazFisico.updateMany({
        where: { id: { in: [necesitado.id, donante.id] } },
        data: { grupoCompatibilidad: "grupo-integracion-sus" },
    });

    const prendaNecesitada = await prisma.prenda.findFirstOrThrow({
        where: {
        disfrazHogarId: necesitado.id,
        tipo: "CAMISA",
        },
    });

    const prendaDonante = await prisma.prenda.findFirstOrThrow({
        where: {
        disfrazHogarId: donante.id,
        tipo: "CAMISA",
        },
    });

    await actualizarPrenda(prendaNecesitada.id, { estado: "DANADA" });

    const candidatos = await buscarCandidatos(prendaNecesitada.id);

    expect(candidatos.some((c) => c.id === prendaDonante.id)).toBe(true);
    });

    it("TC-BE-INV-06: confirma un préstamo y registra la sustitución", async () => {
    const necesitado = await crearDisfrazPrueba("prestamo-destino");
    const donante = await crearDisfrazPrueba("prestamo-origen");

    await prisma.disfrazFisico.updateMany({
        where: { id: { in: [necesitado.id, donante.id] } },
        data: { grupoCompatibilidad: "grupo-integracion-prestamo" },
    });

    const prendaNecesitada = await prisma.prenda.findFirstOrThrow({
        where: {
        disfrazHogarId: necesitado.id,
        tipo: "CAMISA",
        },
    });

    const prendaDonante = await prisma.prenda.findFirstOrThrow({
        where: {
        disfrazHogarId: donante.id,
        tipo: "CAMISA",
        },
    });

    await actualizarPrenda(prendaNecesitada.id, { estado: "DANADA" });

    const candidatos = await buscarCandidatos(prendaNecesitada.id);
    expect(candidatos.map(prenda => prenda.id)).toContain(prendaDonante.id);
    await confirmarPrestamo(prendaNecesitada.id, prendaDonante.id);

    const registro = await prisma.prenda.findUnique({
        where: { id: prendaDonante.id },
    });

    expect(registro?.disfrazHogarId).toBe(donante.id);
    expect(registro?.disfrazActualId).toBe(necesitado.id);

    const sustitucion = await prisma.sustitucion.findFirst({
        where: {
        prendaId: prendaDonante.id,
        disfrazOrigenId: donante.id,
        disfrazDestinoId: necesitado.id,
        },
    });

    expect(sustitucion).not.toBeNull();

    const estado = await obtenerDisfrazConEstado(necesitado.id);

    expect(estado?.estado).toBe("DISPONIBLE");
    expect(estado?.faltantes).toBe(0);
    });

    it("PI-SUS-03: devuelve una prenda prestada a su disfraz original", async () => {
    const necesitado = await crearDisfrazPrueba("devolucion-destino");
    const donante = await crearDisfrazPrueba("devolucion-origen");

    await prisma.disfrazFisico.updateMany({
        where: { id: { in: [necesitado.id, donante.id] } },
        data: { grupoCompatibilidad: "grupo-integracion-devolucion" },
    });

    const prendaNecesitada = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: necesitado.id, tipo: "CAMISA" },
    });

    const prendaDonante = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: donante.id, tipo: "CAMISA" },
    });

    await actualizarPrenda(prendaNecesitada.id, { estado: "DANADA" });

    await confirmarPrestamo(prendaNecesitada.id, prendaDonante.id);
    await devolverPrestamo(prendaDonante.id);

    const registro = await prisma.prenda.findUnique({
        where: { id: prendaDonante.id },
    });

    expect(registro?.disfrazActualId).toBe(donante.id);
    expect(registro?.disfrazHogarId).toBe(donante.id);

    const movimientos = await prisma.sustitucion.findMany({
        where: { prendaId: prendaDonante.id },
    });

    expect(movimientos).toHaveLength(2);
    });

    it("PI-SUS-04: rechaza un préstamo con prendas incompatibles", async () => {
    const necesitado = await crearDisfrazPrueba("incompatible-destino");
    const donante = await crearDisfrazPrueba("incompatible-origen");

    await prisma.disfrazFisico.update({
        where: { id: necesitado.id },
        data: { grupoCompatibilidad: "grupo-integracion-a" },
    });

    await prisma.disfrazFisico.update({
        where: { id: donante.id },
        data: { grupoCompatibilidad: "grupo-integracion-b" },
    });

    const prendaNecesitada = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: necesitado.id, tipo: "CAMISA" },
    });

    const prendaDonante = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: donante.id, tipo: "CAMISA" },
    });

    await expect(
        confirmarPrestamo(prendaNecesitada.id, prendaDonante.id)
    ).rejects.toThrow("La prenda elegida no es un reemplazo válido");

    const registro = await prisma.prenda.findUnique({
        where: { id: prendaDonante.id },
    });

    expect(registro?.disfrazActualId).toBe(donante.id);
    });

    it("PI-SUS-05: impide devolver una prenda que no está prestada", async () => {
    const disfraz = await crearDisfrazPrueba("sin-prestamo");

    const prenda = await prisma.prenda.findFirstOrThrow({
        where: { disfrazHogarId: disfraz.id },
    });

    await expect(
        devolverPrestamo(prenda.id)
    ).rejects.toThrow("Esta prenda no está prestada");
    });


    it("PI-LAV-01: un disfraz suspendido hoy inicia en fase de lavado", async () => {
    const disfraz = await crearDisfrazPrueba("lavado-inicio");

    await suspenderDisfraz(disfraz.id, new Date());

    const resultado = await obtenerDisfrazConEstado(disfraz.id);

    expect(resultado?.estado).toBe("SUSPENDIDO");
    expect(resultado?.faseLavado).toBe("LAVADO");
    });

    it("PI-LAV-02: después de un día hábil pasa a planchado", async () => {
    const disfraz = await crearDisfrazPrueba("lavado-planchado");

    await suspenderDisfraz(
        disfraz.id,
        restarDiasHabiles(new Date(), 1)
    );

    const resultado = await obtenerDisfrazConEstado(disfraz.id);

    expect(resultado?.estado).toBe("SUSPENDIDO");
    expect(resultado?.faseLavado).toBe("PLANCHADO");
    });

    it("PI-LAV-03: después de dos días hábiles pasa a empaquetado", async () => {
    const disfraz = await crearDisfrazPrueba("lavado-empaquetado");

    await suspenderDisfraz(
        disfraz.id,
        restarDiasHabiles(new Date(), 2)
    );

    const resultado = await obtenerDisfrazConEstado(disfraz.id);

    expect(resultado?.estado).toBe("SUSPENDIDO");
    expect(resultado?.faseLavado).toBe("EMPAQUETADO");
    });

    it("PI-LAV-04: después de tres días hábiles se libera automáticamente", async () => {
    const disfraz = await crearDisfrazPrueba("lavado-liberacion");

    await suspenderDisfraz(
        disfraz.id,
        restarDiasHabiles(new Date(), 3)
    );

    await limpiarSuspensionesVencidas();

    const registro = await prisma.disfrazFisico.findUnique({
        where: { id: disfraz.id },
    });

    expect(registro?.estadoManual).toBeNull();
    expect(registro?.fechaSuspension).toBeNull();

    const resultado = await obtenerDisfrazConEstado(disfraz.id);

    expect(resultado?.estado).toBe("DISPONIBLE");
    expect(resultado?.faseLavado).toBeNull();
    });

});
