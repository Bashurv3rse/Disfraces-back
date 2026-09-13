import { Router } from "express";
import { crear, listar, temporadas, tipos } from "./disfraces.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const disfracesRouter = Router();

disfracesRouter.get("/", listar);
disfracesRouter.get("/temporadas", temporadas);
disfracesRouter.get("/tipos", tipos);
disfracesRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);