import { Router } from "express";
import { crear, misAlquileres, todos, eliminar, resumen } from "./alquileres.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const alquileresRouter = Router();

alquileresRouter.post("/", verificarToken, crear);
alquileresRouter.get("/mios", verificarToken, misAlquileres);
alquileresRouter.delete("/:id", verificarToken, eliminar);
alquileresRouter.get("/admin/todos", verificarToken, requiereRol("ADMINISTRADOR"), todos);
alquileresRouter.get("/admin/resumen", verificarToken, requiereRol("ADMINISTRADOR"), resumen);