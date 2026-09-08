import { Router } from "express";
import { crear, listar, actualizarEstado } from "./devoluciones.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const devolucionesRouter = Router();

devolucionesRouter.post("/", verificarToken, crear);
devolucionesRouter.get("/", verificarToken, requiereRol("ADMINISTRADOR"), listar);
devolucionesRouter.patch("/:id", verificarToken, requiereRol("ADMINISTRADOR"), actualizarEstado);