import { Router } from "express";
import {
  recetas,
  buscar,
  previsualizarController,
  reservarController,
  misReservasController,
  cancelarController,
} from "./a-medida.controller";
import { demanda, atender, enCurso } from "./admin.controller";
import { verificarToken, requiereRol } from "../auth/auth.middleware";

export const aMedidaRouter = Router();

aMedidaRouter.get("/recetas", verificarToken, recetas);
aMedidaRouter.post("/buscar", verificarToken, buscar);
aMedidaRouter.post("/previsualizar", verificarToken, previsualizarController);
aMedidaRouter.post("/reservar", verificarToken, reservarController);
aMedidaRouter.get("/reservas", verificarToken, misReservasController);
aMedidaRouter.delete("/reservas/:id", verificarToken, cancelarController);

// Solo administrador: pedidos sin receta y disfraces a medida en curso
aMedidaRouter.get("/admin/demanda", verificarToken, requiereRol("ADMINISTRADOR"), demanda);
aMedidaRouter.post("/admin/demanda/atendida", verificarToken, requiereRol("ADMINISTRADOR"), atender);
aMedidaRouter.get("/admin/en-curso", verificarToken, requiereRol("ADMINISTRADOR"), enCurso);