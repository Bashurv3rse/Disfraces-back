import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./modules/auth/auth.routes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);

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
