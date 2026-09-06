import { Router } from "express";
import { crear, listar, temporadas, actualizarStockController } from "./catalogo.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const catalogoRouter = Router();

catalogoRouter.get("/", listar);
catalogoRouter.get("/temporadas", temporadas);
catalogoRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);
catalogoRouter.patch("/:id/stock", verificarToken, requiereRol("ADMINISTRADOR"), actualizarStockController);