import { PrismaClient } from "@prisma/client";

// Una sola instancia de Prisma para toda la app, evita abrir demasiadas conexiones
export const prisma = new PrismaClient();