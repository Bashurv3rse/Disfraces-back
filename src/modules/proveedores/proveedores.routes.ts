import { Router } from "express";
import { crear, listar, asociar } from "./proveedores.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const proveedoresRouter = Router();

proveedoresRouter.get("/", verificarToken, requiereRol("ADMINISTRADOR"), listar);
proveedoresRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);
proveedoresRouter.post("/:id/piezas", verificarToken, requiereRol("ADMINISTRADOR"), asociar);