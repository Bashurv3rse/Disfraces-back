import { Router } from "express";
import {
  crear, listar, obtenerUno, detalleInventario, temporadas, tipos,
  actualizarEstado, editarPrenda, candidatosPrenda, prestamoPrenda, devolverPrestamoPrenda,
} from "./disfraces.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const disfracesRouter = Router();

disfracesRouter.get("/", listar);
disfracesRouter.get("/temporadas", temporadas);
disfracesRouter.get("/tipos", tipos);
disfracesRouter.get("/:id", obtenerUno);
disfracesRouter.get("/:id/inventario", verificarToken, requiereRol("ADMINISTRADOR"), detalleInventario);
disfracesRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);
disfracesRouter.patch("/:id/estado-manual", verificarToken, requiereRol("ADMINISTRADOR"), actualizarEstado);
disfracesRouter.patch("/prendas/:prendaId", verificarToken, requiereRol("ADMINISTRADOR"), editarPrenda);
disfracesRouter.get("/prendas/:prendaId/candidatos", verificarToken, requiereRol("ADMINISTRADOR"), candidatosPrenda);
disfracesRouter.post("/prendas/:prendaId/prestamo", verificarToken, requiereRol("ADMINISTRADOR"), prestamoPrenda);
disfracesRouter.post("/prendas/:prendaId/devolver-prestamo", verificarToken, requiereRol("ADMINISTRADOR"), devolverPrestamoPrenda);