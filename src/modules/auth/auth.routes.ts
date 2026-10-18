import { Router } from "express";
import {
  registro,
  login,
  refrescar,
  logout,
  perfil,
  actualizarPerfilController,
  cambiarPasswordController,
  listarUsuariosController,
  actualizarRolController,
} from "./auth.controller";

import {
  verificarToken,
  requiereRol,
} from "./auth.middleware";

export const authRouter = Router();

// Autenticación
authRouter.post("/registro", registro);
authRouter.post("/login", login);
authRouter.post("/refrescar", refrescar);
authRouter.post("/logout", verificarToken, logout);

// Perfil propio
authRouter.get(
  "/perfil",
  verificarToken,
  perfil
);

authRouter.patch(
  "/perfil",
  verificarToken,
  actualizarPerfilController
);

authRouter.patch(
  "/perfil/password",
  verificarToken,
  cambiarPasswordController
);

// Administración de usuarios
authRouter.get(
  "/usuarios",
  verificarToken,
  requiereRol("ADMINISTRADOR"),
  listarUsuariosController
);

authRouter.patch(
  "/usuarios/:id/rol",
  verificarToken,
  requiereRol("ADMINISTRADOR"),
  actualizarRolController
);