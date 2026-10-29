import { leerJson, type MensajeHTTP, type ErroresHTTP, type IdHTTP, type CotizacionHTTP, type ResumenHTTP, type ProveedorHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { EstadoAlquiler } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

// Primera hoja de la RTM: HU-07, HU-09 y HU-10, en ese orden.
// El setup de integración valida DATABASE_URL antes de importar esta suite.
describe("RTM — carrito, dashboard y proveedores", () => {
  const prefijo = `rtm-bloque2-${randomUUID()}`;
  const ahora = new Date("2030-06-15T12:00:00.000Z");
  const disfraces: string[] = [];
  const alquileres: string[] = [];
  const proveedores: string[] = [];
  const recetas: string[] = [];
  const promociones: string[] = [];
  let server: Server | undefined;
  let base: string;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    // Comprobación contra el servidor real, además de la URL del setup.
    const bd = await prisma.$queryRaw<{ nombre: string }[]>`SELECT current_database() AS nombre`;
    expect(bd).toEqual([{ nombre: "disfraz_test_db" }]);
    // Solo se fija Date: HTTP, sockets y temporizadores siguen siendo reales.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ahora);
    const datos = { nombre: "Cliente RTM", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    admin = await registrarUsuario({ ...datos, email: `${prefijo}-admin@test.local` });
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  async function limpiarDatos() {
    await prisma.alquilerDisfraz.deleteMany({ where: { alquilerId: { in: alquileres } } });
    await prisma.alquiler.deleteMany({ where: { id: { in: alquileres } } });
    await prisma.prendaProveedor.deleteMany({ where: { proveedorId: { in: proveedores } } });
    await prisma.proveedor.deleteMany({ where: { id: { in: proveedores } } });
    await prisma.prenda.deleteMany({ where: { disfrazHogarId: { in: disfraces } } });
    await prisma.disfrazFisico.deleteMany({ where: { id: { in: disfraces } } });
    await prisma.recetaPieza.deleteMany({ where: { recetaId: { in: recetas } } });
    await prisma.receta.deleteMany({ where: { id: { in: recetas } } });
    await prisma.promocion.deleteMany({ where: { id: { in: promociones } } });
    for (const ids of [alquileres, proveedores, disfraces, recetas, promociones]) ids.length = 0;
  }

  afterEach(limpiarDatos);
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(usuario => usuario.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally {
      vi.useRealTimers();
      await prisma.$disconnect();
    }
  });

  function http(ruta: string, token: string, body?: unknown) {
    return fetch(`${base}${ruta}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function crearDisfraz(nombre: string, precio = 40, estado: "DISPONIBLE" | "DANADA" | "FALTANTE" = "DISPONIBLE") {
    const id = randomUUID();
    disfraces.push(id);
    return prisma.disfrazFisico.create({
      data: {
        id, nombre: `${prefijo}-${nombre}`, tipoDisfraz: prefijo, temporadaEvento: "rtm",
        precioAlquiler: precio,
        prendasHogar: { create: { nombre: "Camisa RTM", tipo: "CAMISA", talla: "M", color: "Rojo", estado, disfrazActualId: id } },
      },
      include: { prendasHogar: true },
    });
  }

  async function cotizar(disfracesIds: string[], fechaInicio: string, fechaFin: string) {
    const respuesta = await http("/pagos/cotizar", cliente.accessToken, { disfraces: disfracesIds, fechaInicio, fechaFin });
    expect(respuesta.status).toBe(200);
    return leerJson<CotizacionHTTP>(respuesta);
  }

  // Aísla los importes esperados de ofertas que pudiera traer una seed de test.
  // Se restauran exactamente las promociones que estaban activas, incluso si falla una aserción.
  async function sinOfertasPrevias(prueba: () => Promise<void>) {
    const activas = await prisma.promocion.findMany({ where: { activa: true }, select: { id: true } });
    const ids = activas.map(promo => promo.id);
    try {
      await prisma.promocion.updateMany({ where: { id: { in: ids } }, data: { activa: false } });
      await prueba();
    } finally {
      await prisma.promocion.updateMany({ where: { id: { in: ids } }, data: { activa: true } });
    }
  }

  async function resumen() {
    const respuesta = await http("/alquileres/admin/resumen", admin.accessToken);
    expect(respuesta.status).toBe(200);
    return leerJson<ResumenHTTP>(respuesta);
  }

  async function crearAlquiler(opciones: { inicio?: string; fin?: string; estado?: EstadoAlquiler; monto?: number; creadoEn?: string } = {}) {
    const id = randomUUID();
    alquileres.push(id);
    return prisma.alquiler.create({ data: {
      id, usuarioId: cliente.usuario.id,
      fechaInicio: new Date(opciones.inicio ?? "2030-06-14T00:00:00Z"),
      fechaFin: new Date(opciones.fin ?? "2030-06-16T00:00:00Z"),
      estado: opciones.estado ?? "ACTIVO", montoTotal: opciones.monto ?? 100,
      creadoEn: new Date(opciones.creadoEn ?? ahora),
    } });
  }

  it("TC-BE-PAG-01: cotiza por HTTP precio diario, días, subtotal, garantía del 25% y total", async () => {
    await sinOfertasPrevias(async () => {
      const disfraz = await crearDisfraz("carrito");
      for (const caso of [
        { fin: "2030-06-15", dias: 1, subtotal: 40, garantia: 10, total: 50 },
        { fin: "2030-06-18", dias: 3, subtotal: 120, garantia: 30, total: 150 },
      ]) {
        const resultado = await cotizar([disfraz.id], "2030-06-15", caso.fin);
        expect(resultado).toMatchObject({ dias: caso.dias, subtotal: caso.subtotal, descuento: 0, totalAlquiler: caso.subtotal, garantia: caso.garantia, totalAPagar: caso.total, reservas: [] });
        expect(resultado.lineas).toHaveLength(1);
        expect(resultado.lineas[0]).toMatchObject({ disfrazId: disfraz.id, precioDia: 40, dias: caso.dias, subtotal: caso.subtotal, total: caso.subtotal });
        expect(resultado).not.toHaveProperty("centavos");
      }
      expect(await prisma.alquiler.count({ where: { usuarioId: cliente.usuario.id } })).toBe(0);
    });
  });

  it("TC-BE-REG-01: agregar recetas, prendas y ofertas ajenas no altera los importes del carrito", async () => {
    await sinOfertasPrevias(async () => {
      const primero = await crearDisfraz("regresion-40");
      const segundo = await crearDisfraz("regresion-25", 25);
      const ids = [primero.id, segundo.id];
      const inicial = await cotizar(ids, "2030-06-15", "2030-06-17");
      expect(inicial).toMatchObject({ dias: 2, subtotal: 130, descuento: 0, totalAlquiler: 130, garantia: 32.5, totalAPagar: 162.5 });
      const recetaId = randomUUID();
      recetas.push(recetaId);
      await prisma.receta.create({ data: { id: recetaId, nombre: `${prefijo}-receta`, precioDia: 99, piezas: { create: { etiqueta: "Camisa azul", tipo: "CAMISA", colores: ["Azul"] } } } });
      const almacen = await crearDisfraz("almacen-ajeno", 99);
      await prisma.disfrazFisico.update({ where: { id: almacen.id }, data: { origen: "ALMACEN" } });
      const promoId = randomUUID();
      promociones.push(promoId);
      await prisma.promocion.create({ data: { id: promoId, nombre: `${prefijo}-oferta-ajena`, descripcion: "Solo otro tipo de disfraz", porcentaje: 50, tipoDisfraz: `${prefijo}-otro` } });
      expect(await cotizar(ids, "2030-06-15", "2030-06-17")).toEqual(inicial);
    });
  });

  it("TC-BE-DASH-01: el resumen refleja total, activos e ingresos del mes persistidos en PostgreSQL", async () => {
    const antes = await resumen();
    await crearAlquiler({ monto: 120 });
    await crearAlquiler({ estado: "FINALIZADO", monto: 80 });
    await crearAlquiler({ creadoEn: "2030-05-20T12:00:00Z", inicio: "2030-05-20", fin: "2030-05-21", monto: 900 });
    const despues = await resumen();
    expect(despues.totalAlquileres).toBe(antes.totalAlquileres + 3);
    expect(despues.alquileresActivos).toBe(antes.alquileresActivos + 1);
    expect(despues.ingresosMes - antes.ingresosMes).toBeCloseTo(200, 2);
  });

  it("TC-BE-DASH-02: solo cuenta activos dentro del rango, incluidos los límites de inicio y fin", async () => {
    const antes = await resumen();
    await crearAlquiler();
    await crearAlquiler({ inicio: "2030-06-15", fin: "2030-06-16" });
    await crearAlquiler({ inicio: "2030-06-14", fin: "2030-06-15" });
    await crearAlquiler({ inicio: "2030-06-16", fin: "2030-06-17" });
    await crearAlquiler({ inicio: "2030-06-13", fin: "2030-06-14" });
    for (const estado of ["PENDIENTE", "FINALIZADO", "CANCELADO"] as const) await crearAlquiler({ estado });
    const despues = await resumen();
    expect(despues.totalAlquileres).toBe(antes.totalAlquileres + 8);
    expect(despues.alquileresActivos).toBe(antes.alquileresActivos + 3);
    expect(despues.alquileresProximos).toBe(antes.alquileresProximos + 1);
  });

  it("TC-BE-DASH-03: alerta por prendas dañadas, faltantes o fuera de su disfraz y excluye los completos", async () => {
    const completo = await crearDisfraz("completo");
    const danado = await crearDisfraz("danado", 40, "DANADA");
    const faltante = await crearDisfraz("faltante", 40, "FALTANTE");
    const desplazado = await crearDisfraz("prenda-fuera");
    await prisma.prenda.update({ where: { id: desplazado.prendasHogar[0].id }, data: { disfrazActualId: completo.id } });
    const resultado = await resumen();
    const propias = resultado.alertasStock.filter((alerta: { nombre: string }) => alerta.nombre.startsWith(prefijo));
    expect(propias.map((alerta: { nombre: string }) => alerta.nombre).sort()).toEqual([danado.nombre, faltante.nombre, desplazado.nombre].sort());
    for (const alerta of propias) expect(alerta.detalle).toMatch(/incompleto/i);
  });

  it("TC-BE-PROV-01: crea un proveedor con datos obligatorios y rechaza campos ausentes sin persistir", async () => {
    const cantidadAntes = await prisma.proveedor.count({ where: { nombre: { startsWith: prefijo } } });
    for (const datos of [{ nombre: `${prefijo}-sin-contacto` }, { contacto: "Contacto RTM" }, {}]) {
      const respuesta = await http("/proveedores", admin.accessToken, datos);
      expect(respuesta.status).toBe(400);
      expect((await leerJson<ErroresHTTP>(respuesta)).errores).toBeDefined();
    }
    expect(await prisma.proveedor.count({ where: { nombre: { startsWith: prefijo } } })).toBe(cantidadAntes);
    const datos = { nombre: `${prefijo}-proveedor`, contacto: "Contacto RTM", telefono: "987654321", email: "proveedor@test.local" };
    const respuesta = await http("/proveedores", admin.accessToken, datos);
    expect(respuesta.status).toBe(201);
    const proveedor = await leerJson<IdHTTP>(respuesta);
    proveedores.push(proveedor.id);
    expect(proveedor).toMatchObject(datos);
    expect(await prisma.proveedor.findUniqueOrThrow({ where: { id: proveedor.id } })).toMatchObject(datos);
  });

  it("TC-BE-PROV-02: asocia una prenda una sola vez y el listado refleja sus cantidades reales", async () => {
    const id = randomUUID();
    proveedores.push(id);
    await prisma.proveedor.create({ data: { id, nombre: `${prefijo}-asociacion`, contacto: "Contacto RTM" } });
    const disfraz = await crearDisfraz("prenda-proveedor");
    const prendaId = disfraz.prendasHogar[0].id;
    async function consultarPrendas() {
      const respuesta = await http("/proveedores", admin.accessToken);
      expect(respuesta.status).toBe(200);
      return (await leerJson<ProveedorHTTP[]>(respuesta)).find((proveedor: { id: string }) => proveedor.id === id)!.prendas;
    }
    expect(await consultarPrendas()).toHaveLength(0);
    const asociacion = await http(`/proveedores/${id}/piezas`, admin.accessToken, { prendaId });
    expect(asociacion.status).toBe(201);
    expect(await asociacion.json()).toMatchObject({ proveedorId: id, prendaId });
    const duplicada = await http(`/proveedores/${id}/piezas`, admin.accessToken, { prendaId });
    expect(duplicada.status).toBe(400);
    expect((await leerJson<MensajeHTTP>(duplicada)).mensaje).toMatch(/asociar/i);
    expect(await prisma.prendaProveedor.count({ where: { proveedorId: id, prendaId } })).toBe(1);
    const prendas = await consultarPrendas();
    expect(prendas).toHaveLength(1);
    expect(prendas[0].prenda).toMatchObject({ id: prendaId, nombre: "Camisa RTM", talla: "M", color: "Rojo" });
  });
});
