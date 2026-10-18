import { Router } from "express";
import { listar, crear, actualizar, activar, eliminar } from "./recetas.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const recetasRouter = Router();

recetasRouter.get("/", verificarToken, requiereRol("ADMINISTRADOR"), listar);
recetasRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);
recetasRouter.put("/:id", verificarToken, requiereRol("ADMINISTRADOR"), actualizar);
recetasRouter.patch("/:id/activa", verificarToken, requiereRol("ADMINISTRADOR"), activar);
recetasRouter.delete("/:id", verificarToken, requiereRol("ADMINISTRADOR"), eliminar);