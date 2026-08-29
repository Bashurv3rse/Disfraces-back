import { Router } from "express";
import { registro, login, listarUsuariosController, actualizarRolController } from "./auth.controller";
import { verificarToken, requiereRol } from "./auth.middleware";

export const authRouter = Router();

authRouter.post("/registro", registro);
authRouter.post("/login", login);

authRouter.get("/perfil", verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

authRouter.get("/usuarios", verificarToken, requiereRol("ADMINISTRADOR"), listarUsuariosController);
authRouter.patch("/usuarios/:id/rol", verificarToken, requiereRol("ADMINISTRADOR"), actualizarRolController);