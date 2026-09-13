import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./modules/auth/auth.routes";
import { proveedoresRouter } from "./modules/proveedores/proveedores.routes";
import { alquileresRouter } from "./modules/alquileres/alquileres.routes";
import { devolucionesRouter } from "./modules/devoluciones/devoluciones.routes";
import { disfracesRouter } from "./modules/disfraces/disfraces.routes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/proveedores", proveedoresRouter);
app.use("/api/alquileres", alquileresRouter);
app.use("/api/disfraces", disfracesRouter);
app.use("/api/devoluciones", devolucionesRouter);

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
