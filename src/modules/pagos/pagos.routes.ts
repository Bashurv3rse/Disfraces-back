import { Router } from "express";
import { crearSesion, confirmar, cotizarController, ofertas } from "./pagos.controller";
import { verificarToken } from "../auth/auth.middleware";

export const pagosRouter = Router();

pagosRouter.get("/ofertas", ofertas); // público: las ofertas automáticas se ven sin iniciar sesión
pagosRouter.post("/cotizar", verificarToken, cotizarController);
pagosRouter.post("/crear-sesion", verificarToken, crearSesion);
pagosRouter.post("/confirmar", verificarToken, confirmar);