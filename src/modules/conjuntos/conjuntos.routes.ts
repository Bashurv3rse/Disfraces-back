import { Router } from "express";
import { crear, listar } from "./conjuntos.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const conjuntosRouter = Router();

conjuntosRouter.get("/", listar);
conjuntosRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);