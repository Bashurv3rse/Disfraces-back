import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

dotenv.config();

export const app = express();

// --- Cabeceras de seguridad HTTP (mitiga Clickjacking, MIME-sniffing, XSS) ---
app.use(helmet());

// --- CORS restringido a un origen conocido, no abierto a cualquiera ---
const origenPermitido =
  process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: origenPermitido,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// --- Rate limiting contra fuerza bruta en login/registro (control preventivo) ---
const limitadorLogin = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 5,
  message: {
    mensaje:
      "Demasiados intentos. Espera un minuto e inténtalo de nuevo.",
  },
  standardHeaders: true,
  legacyHeaders: false,

  // La suite habitual evita el límite; las pruebas de seguridad pueden
  // activarlo explícitamente sin cambiar NODE_ENV ni la base de test.
  skip: () => process.env.NODE_ENV === "test" && process.env.TEST_LOGIN_RATE_LIMIT !== "true",
});

const limitadorRegistro = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  message: {
    mensaje:
      "Demasiadas cuentas creadas desde esta IP. Intenta más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Rate limiting para cambio de contraseña ---
const limitadorPassword = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 5,
  message: {
    mensaje:
      "Demasiados intentos de cambio de contraseña. Intenta más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const limitadorCotizar = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: { mensaje: "Demasiadas consultas de precio. Espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
});

const limitadorAMedidaConsulta = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  message: { mensaje: "Demasiadas consultas. Espera un momento." },
  standardHeaders: true,
  legacyHeaders: false,
});

const limitadorAMedidaReserva = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  message: { mensaje: "Demasiados intentos de reserva. Espera un minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "disfraces-alquiler-backend",
  });
});

import { authRouter } from "./modules/auth/auth.routes";
import { proveedoresRouter } from "./modules/proveedores/proveedores.routes";
import { alquileresRouter } from "./modules/alquileres/alquileres.routes";
import { devolucionesRouter } from "./modules/devoluciones/devoluciones.routes";
import { disfracesRouter } from "./modules/disfraces/disfraces.routes";
import { pagosRouter } from "./modules/pagos/pagos.routes";
import { almacenRouter } from "./modules/almacen/almacen.routes";
import { recetasRouter } from "./modules/recetas/recetas.routes";
import { aMedidaRouter } from "./modules/a-medida/a-medida.routes";
import { ajusteTallaRouter } from "./modules/ajuste-talla/ajuste.routes";

// Rate limiting específico de autenticación
app.use("/api/auth/login", limitadorLogin);
app.use("/api/auth/registro", limitadorRegistro);
app.use("/api/auth/perfil/password", limitadorPassword);

// Rutas
app.use("/api/auth", authRouter);
app.use("/api/proveedores", proveedoresRouter);
app.use("/api/alquileres", alquileresRouter);
app.use("/api/devoluciones", devolucionesRouter);
app.use("/api/disfraces", disfracesRouter);
app.use("/api/pagos/cotizar", limitadorCotizar);
app.use("/api/pagos", pagosRouter);
app.use("/api/almacen", almacenRouter);
app.use("/api/recetas", recetasRouter);
app.use(["/api/a-medida/buscar", "/api/a-medida/previsualizar"], limitadorAMedidaConsulta);
app.use("/api/a-medida/reservar", limitadorAMedidaReserva);
app.use("/api/a-medida", aMedidaRouter);
app.use("/api/ajuste-talla/reservar", limitadorAMedidaReserva);
app.use("/api/ajuste-talla", limitadorAMedidaConsulta, ajusteTallaRouter);

const PORT = Number(process.env.PORT || 3000);

if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}