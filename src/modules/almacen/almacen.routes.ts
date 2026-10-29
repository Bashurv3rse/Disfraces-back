import { Router } from "express";
import { listar, agregar, retirar } from "./almacen.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const almacenRouter = Router();

almacenRouter.get("/", verificarToken, requiereRol("ADMINISTRADOR"), listar);
almacenRouter.post("/piezas", verificarToken, requiereRol("ADMINISTRADOR"), agregar);
almacenRouter.post("/piezas/retirar", verificarToken, requiereRol("ADMINISTRADOR"), retirar);