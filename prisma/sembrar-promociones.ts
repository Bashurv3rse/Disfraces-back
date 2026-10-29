import { PrismaClient } from "@prisma/client";
import { sembrarPromociones } from "./promociones";

const prisma = new PrismaClient();

sembrarPromociones(prisma)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });