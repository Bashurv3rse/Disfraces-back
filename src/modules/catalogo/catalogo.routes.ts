import { Router } from "express";
import { crear } from "./catalogo.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const catalogoRouter = Router();

catalogoRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);