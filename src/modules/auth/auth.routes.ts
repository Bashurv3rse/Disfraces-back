import { Router } from "express";
import { registro, login } from "./auth.controller";
import { verificarToken, requiereRol } from "./auth.middleware";

export const authRouter = Router();

authRouter.post("/registro", registro);
authRouter.post("/login", login);

// Ruta de prueba: cualquier usuario autenticado puede ver su propio perfil
authRouter.get("/perfil", verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

// Ruta de prueba: solo administradores
authRouter.get("/solo-admin", verificarToken, requiereRol("ADMINISTRADOR"), (req, res) => {
  res.json({ mensaje: "Bienvenido, administrador" });
});