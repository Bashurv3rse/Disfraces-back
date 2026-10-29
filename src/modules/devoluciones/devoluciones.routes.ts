import { Router } from "express";
import { crear, listar, corregirPrenda, resolver } from "./devoluciones.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const devolucionesRouter = Router();

devolucionesRouter.post("/", verificarToken, crear);
devolucionesRouter.get("/", verificarToken, requiereRol("ADMINISTRADOR"), listar);
devolucionesRouter.patch("/:id/prendas/:prendaId", verificarToken, requiereRol("ADMINISTRADOR"), corregirPrenda);
devolucionesRouter.post("/:id/garantia", verificarToken, requiereRol("ADMINISTRADOR"), resolver);