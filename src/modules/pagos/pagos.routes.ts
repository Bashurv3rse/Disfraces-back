import { Router } from "express";
import { crearSesion, confirmar } from "./pagos.controller";
import { verificarToken } from "../auth/auth.middleware";

export const pagosRouter = Router();

pagosRouter.post("/crear-sesion", verificarToken, crearSesion);
pagosRouter.post("/confirmar", verificarToken, confirmar);