import { Router } from "express";
import { crear, listar } from "./conjuntos.controller";
import { verificarToken } from "../auth/auth.middleware";

export const conjuntosRouter = Router();

conjuntosRouter.get("/", listar);
// La validación de rol (solo admin para PREDETERMINADO) se hace dentro del controlador,
// porque depende del campo "tipo" del body, no solo del rol del usuario.
conjuntosRouter.post("/", verificarToken, crear);