import { Router } from "express";
import {
  recetas,
  buscar,
  previsualizarController,
  reservarController,
  misReservasController,
  cancelarController,
} from "./a-medida.controller";
import { verificarToken } from "../auth/auth.middleware";

export const aMedidaRouter = Router();

aMedidaRouter.get("/recetas", verificarToken, recetas);
aMedidaRouter.post("/buscar", verificarToken, buscar);
aMedidaRouter.post("/previsualizar", verificarToken, previsualizarController);
aMedidaRouter.post("/reservar", verificarToken, reservarController);
aMedidaRouter.get("/reservas", verificarToken, misReservasController);
aMedidaRouter.delete("/reservas/:id", verificarToken, cancelarController);