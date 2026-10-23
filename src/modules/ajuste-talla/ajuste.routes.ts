import { Router } from "express";
import { info, previsualizar, reservar } from "./ajuste.controller";
import { verificarToken } from "../auth/auth.middleware";

export const ajusteTallaRouter = Router();

ajusteTallaRouter.post("/previsualizar", verificarToken, previsualizar);
ajusteTallaRouter.post("/reservar", verificarToken, reservar);
ajusteTallaRouter.get("/:disfrazId", verificarToken, info);