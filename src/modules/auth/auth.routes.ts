import { Router } from "express";
import { registro, login } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/registro", registro);
authRouter.post("/login", login);