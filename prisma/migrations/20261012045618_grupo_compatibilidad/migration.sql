-- AlterTable
ALTER TABLE "DisfrazFisico" ADD COLUMN     "familia" TEXT,
ADD COLUMN     "grupoCompatibilidad" TEXT;

-- CreateIndex
CREATE INDEX "DisfrazFisico_grupoCompatibilidad_idx" ON "DisfrazFisico"("grupoCompatibilidad");
