import { leerJson, type IdHTTP, type BusquedaHTTP, type PropuestaHTTP, type RecetaHTTP, type DemandaHTTP, type AlmacenHTTP } from "./helpers/respuestas-http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/main";
import { prisma } from "../../src/config/prisma";
import { registrarUsuario } from "../../src/modules/auth/auth.service";

// Primera hoja de la RTM: HU-31, HU-32 y HU-33, en orden.
describe("RTM — pedidos, recetas y almacén", () => {
  const prefijo = `rtmpedrec-${randomUUID()}`;
  let server: Server | undefined;
  let base: string;
  let almacenId: string;
  let almacenPropio = false;
  let admin: Awaited<ReturnType<typeof registrarUsuario>>;
  let cliente: Awaited<ReturnType<typeof registrarUsuario>>;
  let otro: Awaited<ReturnType<typeof registrarUsuario>>;
  let proveedor: Awaited<ReturnType<typeof registrarUsuario>>;

  beforeAll(async () => {
    expect(await prisma.$queryRaw`SELECT current_database() AS nombre`).toEqual([{ nombre: "disfraz_test_db" }]);
    const datos = { nombre: "Usuario RTM recetas", password: "PruebaRtm#2026", telefono: "987654321", direccion: "Dirección RTM 123" };
    admin = await registrarUsuario({ ...datos, email: `${prefijo}-admin@test.local` });
    cliente = await registrarUsuario({ ...datos, email: `${prefijo}-cliente@test.local` });
    otro = await registrarUsuario({ ...datos, email: `${prefijo}-otro@test.local` });
    proveedor = await registrarUsuario({ ...datos, email: `${prefijo}-proveedor@test.local` });
    await prisma.usuario.update({ where: { id: admin.usuario.id }, data: { rol: "ADMINISTRADOR" } });
    await prisma.usuario.update({ where: { id: proveedor.usuario.id }, data: { rol: "PROVEEDOR" } });
    // La API trabaja con el primer almacén: reutilizarlo evita tocar piezas preexistentes.
    const existente = await prisma.disfrazFisico.findFirst({ where: { origen: "ALMACEN" }, select: { id: true } });
    if (existente) almacenId = existente.id;
    else {
      almacenId = randomUUID();
      await prisma.disfrazFisico.create({ data: { id: almacenId, nombre: `${prefijo}-almacen`, origen: "ALMACEN", tipoDisfraz: "Almacén", temporadaEvento: "rtm", precioAlquiler: 0 } });
      almacenPropio = true;
    }
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto HTTP");
    base = `http://127.0.0.1:${address.port}/api`;
  });

  async function limpiarDatos() {
    await prisma.peticionDisfraz.deleteMany({ where: { usuario: { email: { startsWith: prefijo } } } });
    await prisma.recetaPieza.deleteMany({ where: { receta: { nombre: { startsWith: prefijo } } } });
    await prisma.receta.deleteMany({ where: { nombre: { startsWith: prefijo } } });
    await prisma.prenda.deleteMany({ where: { nombre: { startsWith: prefijo }, disfrazHogarId: almacenId } });
  }
  afterEach(limpiarDatos);
  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await limpiarDatos();
      if (almacenPropio) await prisma.disfrazFisico.deleteMany({ where: { id: almacenId } });
      const usuarios = await prisma.usuario.findMany({ where: { email: { startsWith: prefijo } }, select: { id: true } });
      const ids = usuarios.map(usuario => usuario.id);
      await prisma.sesionActiva.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function http(ruta: string, token = admin.accessToken, method = "GET", body?: unknown) {
    return fetch(`${base}${ruta}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const palabra = () => `clave${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  function datosReceta(sufijo: string, clave = palabra()) {
    return { nombre: `${prefijo}-${sufijo}`, descripcion: "Receta de integración", precioDia: 40, activa: true, palabrasClave: [clave], piezas: [{ etiqueta: "Camisa", tipo: "CAMISA", colores: ["Rojo"], nombreContiene: `${prefijo}-camisa`, obligatoria: true }] };
  }
  async function crearReceta(datos = datosReceta("receta")) {
    const respuesta = await http("/recetas", admin.accessToken, "POST", datos);
    expect(respuesta.status).toBe(201);
    return leerJson<RecetaHTTP>(respuesta);
  }
  async function pedir(texto: string, token = cliente.accessToken) {
    const respuesta = await http("/a-medida/buscar", token, "POST", { texto });
    expect(respuesta.status).toBe(200);
    const resultado = await leerJson<BusquedaHTTP>(respuesta);
    expect(resultado.resultado).toBe("SIN_RECETA");
    return resultado.peticionId as string;
  }
  async function demanda() {
    const respuesta = await http("/a-medida/admin/demanda");
    expect(respuesta.status).toBe(200);
    return leerJson<DemandaHTTP>(respuesta);
  }

  it("TC-BE-PED-01: un pedido sin receta queda pendiente y repetirlo inmediatamente no lo duplica", async () => {
    const texto = palabra();
    const id = await pedir(texto);
    expect(await prisma.peticionDisfraz.findUniqueOrThrow({ where: { id } })).toMatchObject({ usuarioId: cliente.usuario.id, texto, textoNormalizado: texto, recetaId: null, atendida: false });
    expect(await pedir(texto)).toBe(id);
    expect(await prisma.peticionDisfraz.count({ where: { usuarioId: cliente.usuario.id, textoNormalizado: texto } })).toBe(1);
    expect(await prisma.reserva.count({ where: { usuarioId: cliente.usuario.id } })).toBe(0);
  });

  it("TC-BE-PED-02: el administrador ve la demanda agrupada y atiende solo los pedidos elegidos", async () => {
    const antes = await demanda();
    const texto = palabra();
    const ids = [await pedir(texto), await pedir(texto, otro.accessToken)];
    const ajeno = await pedir(palabra());
    const lista = await demanda();
    expect(lista.grupos.find((g: { textoNormalizado: string }) => g.textoNormalizado === texto)).toMatchObject({ veces: 2, personas: 2 });
    expect(lista.resumen.pedidosPendientes).toBe(antes.resumen.pedidosPendientes + 3);
    const ruta = "/a-medida/admin/demanda/atendida";
    expect((await http(ruta, cliente.accessToken, "POST", { textoNormalizado: texto })).status).toBe(403);
    expect(await prisma.peticionDisfraz.count({ where: { id: { in: ids }, atendida: false } })).toBe(2);
    const atendida = await http(ruta, admin.accessToken, "POST", { textoNormalizado: texto });
    expect(atendida.status).toBe(200);
    expect(await atendida.json()).toEqual({ marcados: 2 });
    expect(await prisma.peticionDisfraz.count({ where: { id: { in: ids }, atendida: true, recetaId: null } })).toBe(2);
    expect((await prisma.peticionDisfraz.findUniqueOrThrow({ where: { id: ajeno } })).atendida).toBe(false);
    const despues = await demanda();
    expect(despues.grupos.some((g: { textoNormalizado: string }) => g.textoNormalizado === texto)).toBe(false);
    expect(despues.resumen.atendidosSinReceta).toBe(antes.resumen.atendidosSinReceta + 2);
    expect((await http(ruta, admin.accessToken, "POST", { textoNormalizado: texto })).status).toBe(404);
  });

  it("TC-BE-PED-03: crear una receta vincula los pedidos coincidentes y conserva los de otra palabra clave", async () => {
    const clave = palabra();
    const coincidentes = [await pedir(clave), await pedir(`quiero ${clave}`, otro.accessToken)];
    const noCoincidente = await pedir(palabra());
    const receta = await crearReceta(datosReceta("vinculada", clave));
    expect(receta.peticionesVinculadas).toBe(2);
    for (const id of coincidentes) expect(await prisma.peticionDisfraz.findUniqueOrThrow({ where: { id } })).toMatchObject({ recetaId: receta.id, atendida: true });
    expect(await prisma.peticionDisfraz.findUniqueOrThrow({ where: { id: noCoincidente } })).toMatchObject({ recetaId: null, atendida: false });
    const busqueda = await http("/a-medida/buscar", cliente.accessToken, "POST", { texto: clave });
    expect(busqueda.status).toBe(200);
    expect(await busqueda.json()).toMatchObject({ resultado: "EXACTA", recetas: [expect.objectContaining({ id: receta.id })] });
  });

  it("TC-BE-REC-01: el administrador crea, edita y elimina una receta con sus piezas y palabras clave", async () => {
    const clave = palabra();
    const datos = datosReceta("original", clave);
    const receta = await crearReceta({ ...datos, palabrasClave: [clave.toUpperCase(), clave] });
    const creada = await prisma.receta.findUniqueOrThrow({ where: { id: receta.id }, include: { piezas: true } });
    expect(creada.palabrasClave).toEqual([clave]);
    expect(creada.piezas[0]).toMatchObject({ tipo: "CAMISA", colores: ["rojo"], obligatoria: true });
    const nuevaClave = palabra();
    const cambios = { ...datos, nombre: `${prefijo}-editada`, precioDia: 65.5, palabrasClave: [nuevaClave], piezas: [
      { etiqueta: "Pantalón", tipo: "PANTALON", colores: ["Negro"], obligatoria: true },
      { etiqueta: "Sombrero", tipo: "SOMBRERO", colores: [], obligatoria: false },
    ] };
    expect((await http(`/recetas/${receta.id}`, admin.accessToken, "PUT", cambios)).status).toBe(200);
    const editada = await prisma.receta.findUniqueOrThrow({ where: { id: receta.id }, include: { piezas: true } });
    expect(editada.nombre).toBe(cambios.nombre);
    expect(editada.precioDia.toNumber()).toBe(65.5);
    expect(editada.palabrasClave).toEqual([nuevaClave]);
    expect(editada.piezas).toHaveLength(2);
    expect(editada.piezas.map(p => p.tipo).sort()).toEqual(["PANTALON", "SOMBRERO"]);
    expect(await prisma.recetaPieza.findUnique({ where: { id: creada.piezas[0].id } })).toBeNull();
    const listado = await http("/recetas");
    expect(listado.status).toBe(200);
    expect((await leerJson<IdHTTP[]>(listado)).some((r: { id: string }) => r.id === receta.id)).toBe(true);
    expect((await http(`/recetas/${receta.id}`, admin.accessToken, "DELETE")).status).toBe(204);
    expect(await prisma.receta.findUnique({ where: { id: receta.id } })).toBeNull();
    expect(await prisma.recetaPieza.count({ where: { recetaId: receta.id } })).toBe(0);
  });

  it("TC-BE-REC-03: clientes y proveedores no pueden modificar recetas y el administrador sí puede hacerlo", async () => {
    const datos = datosReceta("permisos");
    const receta = await crearReceta(datos);
    const antes = await prisma.receta.findUniqueOrThrow({ where: { id: receta.id }, include: { piezas: true } });
    for (const token of [cliente.accessToken, proveedor.accessToken]) {
      for (const [ruta, metodo, body] of [
        ["/recetas", "POST", datosReceta("prohibida")],
        [`/recetas/${receta.id}`, "PUT", { ...datos, precioDia: 80 }],
        [`/recetas/${receta.id}/activa`, "PATCH", { activa: false }],
        [`/recetas/${receta.id}`, "DELETE", undefined],
      ] as const) expect((await http(ruta, token, metodo, body)).status).toBe(403);
    }
    expect(await prisma.receta.findUniqueOrThrow({ where: { id: receta.id }, include: { piezas: true } })).toEqual(antes);
    expect(await prisma.receta.count({ where: { nombre: { startsWith: prefijo } } })).toBe(1);
    expect((await http(`/recetas/${receta.id}`, admin.accessToken, "PUT", { ...datos, precioDia: 80 })).status).toBe(200);
    expect((await http(`/recetas/${receta.id}/activa`, admin.accessToken, "PATCH", { activa: false })).status).toBe(200);
    expect((await prisma.receta.findUniqueOrThrow({ where: { id: receta.id } })).activa).toBe(false);
    expect((await http(`/recetas/${receta.id}`, admin.accessToken, "DELETE")).status).toBe(204);
  });

  it("TC-BE-ALM-01: agregar piezas por HTTP persiste origen ALMACEN, talla, color y estado y actualiza el stock", async () => {
    const nombre = `${prefijo}-camisa`;
    const respuesta = await http("/almacen/piezas", admin.accessToken, "POST", { nombre, tipo: "CAMISA", color: "Rojo", tallas: [{ talla: "M", cantidad: 2 }, { talla: "L", cantidad: 1 }] });
    expect(respuesta.status).toBe(201);
    expect(await respuesta.json()).toEqual({ agregadas: 3 });
    const prendas = await prisma.prenda.findMany({ where: { nombre }, include: { disfrazHogar: true } });
    expect(prendas).toHaveLength(3);
    expect(prendas.map(p => p.talla).sort()).toEqual(["L", "M", "M"]);
    for (const prenda of prendas) {
      expect(prenda).toMatchObject({ tipo: "CAMISA", color: "rojo", estado: "DISPONIBLE", disfrazHogarId: almacenId, disfrazActualId: almacenId });
      expect(prenda.disfrazHogar.origen).toBe("ALMACEN");
    }
    const listado = await http("/almacen");
    expect(listado.status).toBe(200);
    const grupo = (await leerJson<AlmacenHTTP>(listado)).grupos.find((g: { nombre: string }) => g.nombre === nombre);
    expect(grupo).toMatchObject({ totalDisponibles: 3, tipo: "CAMISA", color: "rojo" });
    expect(grupo!.tallas).toEqual(expect.arrayContaining([
      expect.objectContaining({ talla: "M", total: 2, disponibles: 2 }),
      expect.objectContaining({ talla: "L", total: 1, disponibles: 1 }),
    ]));
  });

  it("TC-BE-ALM-02: el motor excluye una pieza dañada y vuelve a proponerla después de repararla", async () => {
    const nombre = `${prefijo}-camisa`;
    expect((await http("/almacen/piezas", admin.accessToken, "POST", { nombre, tipo: "CAMISA", color: "Rojo", tallas: [{ talla: "M", cantidad: 1 }] })).status).toBe(201);
    const prenda = await prisma.prenda.findFirstOrThrow({ where: { nombre, disfrazHogarId: almacenId } });
    const receta = await crearReceta(datosReceta("reparacion"));
    const rutaPrenda = `/disfraces/prendas/${prenda.id}`;
    expect((await http(rutaPrenda, admin.accessToken, "PATCH", { estado: "DANADA" })).status).toBe(200);
    const entrada = { recetaId: receta.id, tallas: { ropa: "M" } };
    const incompleta = await http("/a-medida/previsualizar", cliente.accessToken, "POST", entrada);
    expect(incompleta.status).toBe(200);
    const propuesta = await leerJson<PropuestaHTTP>(incompleta);
    expect(propuesta.completo).toBe(false);
    expect(propuesta.piezas).toEqual([]);
    expect(propuesta.faltantes).toHaveLength(1);
    expect((await http("/a-medida/reservar", cliente.accessToken, "POST", entrada)).status).toBe(409);
    expect(await prisma.reserva.count({ where: { recetaId: receta.id } })).toBe(0);
    expect((await http(rutaPrenda, admin.accessToken, "PATCH", { estado: "DISPONIBLE" })).status).toBe(200);
    const reparada = await http("/a-medida/previsualizar", cliente.accessToken, "POST", entrada);
    expect(reparada.status).toBe(200);
    const disponible = await leerJson<PropuestaHTTP>(reparada);
    expect(disponible.completo).toBe(true);
    expect(disponible.faltantes).toEqual([]);
    expect(disponible.piezas).toHaveLength(1);
    expect(disponible.piezas[0]).toMatchObject({ nombre, tipo: "CAMISA", talla: "M" });
    expect(await prisma.prenda.findUniqueOrThrow({ where: { id: prenda.id } })).toMatchObject({ estado: "DISPONIBLE", disfrazActualId: almacenId });
  });
});
