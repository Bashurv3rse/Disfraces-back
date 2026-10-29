-- CreateEnum
CREATE TYPE "EstadoManualDisfraz" AS ENUM ('EN_REPARACION', 'SUSPENDIDO');

-- AlterTable
ALTER TABLE "DisfrazFisico" ADD COLUMN     "estadoManual" "EstadoManualDisfraz";

-- AlterTable
ALTER TABLE "Prenda" ADD COLUMN     "calidad" TEXT NOT NULL DEFAULT 'bueno';
