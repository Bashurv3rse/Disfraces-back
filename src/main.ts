import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// --- Cabeceras de seguridad HTTP (mitiga Clickjacking, MIME-sniffing, XSS) ---
app.use(helmet());

// --- CORS restringido a un origen conocido, no abierto a cualquiera ---
const origenPermitido = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: origenPermitido, credentials: true }));

app.use(express.json());

// --- Rate limiting contra fuerza bruta en login/registro (control preventivo) ---
const limitadorLogin = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 5,
  message: { mensaje: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

const limitadorRegistro = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  message: { mensaje: "Demasiadas cuentas creadas desde esta IP. Intenta más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "disfraces-alquiler-backend" });
});

import { authRouter } from "./modules/auth/auth.routes";
import { proveedoresRouter } from "./modules/proveedores/proveedores.routes";
import { alquileresRouter } from "./modules/alquileres/alquileres.routes";
import { devolucionesRouter } from "./modules/devoluciones/devoluciones.routes";
import { disfracesRouter } from "./modules/disfraces/disfraces.routes";
import { pagosRouter } from "./modules/pagos/pagos.routes";

app.use("/api/auth/login", limitadorLogin);
app.use("/api/auth/registro", limitadorRegistro);

app.use("/api/auth", authRouter);
app.use("/api/proveedores", proveedoresRouter);
app.use("/api/alquileres", alquileresRouter);
app.use("/api/devoluciones", devolucionesRouter);
app.use("/api/disfraces", disfracesRouter);
app.use("/api/pagos", pagosRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});