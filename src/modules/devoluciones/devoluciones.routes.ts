import { Router } from "express";
import { crear, listar } from "./devoluciones.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const devolucionesRouter = Router();

devolucionesRouter.post("/", verificarToken, crear);
devolucionesRouter.get("/", verificarToken, requiereRol("ADMINISTRADOR"), listar);