import { Router } from "express";
import { registro, login, refrescar, logout, perfil, listarUsuariosController, actualizarRolController } from "./auth.controller";
import { verificarToken, requiereRol } from "./auth.middleware";

export const authRouter = Router();

authRouter.post("/registro", registro);
authRouter.post("/login", login);
authRouter.post("/refrescar", refrescar);
authRouter.post("/logout", verificarToken, logout);

authRouter.get("/perfil", verificarToken, perfil);

authRouter.get("/usuarios", verificarToken, requiereRol("ADMINISTRADOR"), listarUsuariosController);
authRouter.patch("/usuarios/:id/rol", verificarToken, requiereRol("ADMINISTRADOR"), actualizarRolController);