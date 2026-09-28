import { Router } from "express";
import { crear, misAlquileres, todos, resumen } from "./alquileres.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const alquileresRouter = Router();

// La creación directa queda para el admin (ej. alquiler presencial pagado en
// efectivo). El cliente siempre pasa por la pasarela de pagos (módulo pagos).
alquileresRouter.post("/", verificarToken, requiereRol("ADMINISTRADOR"), crear);
alquileresRouter.get("/mios", verificarToken, misAlquileres);
alquileresRouter.get("/admin/todos", verificarToken, requiereRol("ADMINISTRADOR"), todos);
alquileresRouter.get("/admin/resumen", verificarToken, requiereRol("ADMINISTRADOR"), resumen);