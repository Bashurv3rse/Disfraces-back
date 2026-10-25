-- CreateEnum
CREATE TYPE "EstadoGarantia" AS ENUM ('PENDIENTE', 'DEVUELTA', 'RETENIDA');

-- AlterTable
ALTER TABLE "Devolucion" ADD COLUMN     "garantiaEstado" "EstadoGarantia" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "garantiaMonto" DECIMAL(10,2),
ADD COLUMN     "garantiaMotivo" TEXT,
ADD COLUMN     "garantiaReembolsoId" TEXT,
ADD COLUMN     "garantiaResueltaEn" TIMESTAMP(3),
ADD COLUMN     "garantiaResueltaPorId" TEXT;

-- AlterTable
ALTER TABLE "DevolucionPrenda" ADD COLUMN     "estadoAdmin" "EstadoPrendaDevuelta";

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_garantiaResueltaPorId_fkey" FOREIGN KEY ("garantiaResueltaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
