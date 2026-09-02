import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogoRouter } from "./modules/catalogo/catalogo.routes";
import { conjuntosRouter } from "./modules/conjuntos/conjuntos.routes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/catalogo", catalogoRouter);
app.use("/api/conjuntos", conjuntosRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "disfraces-alquiler-backend" });
});

// TODO: montar routers de cada módulo, ej:
// import { authRouter } from "./modules/auth/auth.routes";
// app.use("/api/auth", authRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
