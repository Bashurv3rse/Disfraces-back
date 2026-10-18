import { PrismaClient } from "@prisma/client";
import { sembrarAlmacenYRecetas } from "./almacen-recetas";

const prisma = new PrismaClient();

sembrarAlmacenYRecetas(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());