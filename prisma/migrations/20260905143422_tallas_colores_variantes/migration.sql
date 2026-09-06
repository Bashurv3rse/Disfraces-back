-- AlterTable
ALTER TABLE "Alquiler" ADD COLUMN     "colorElegido" TEXT,
ADD COLUMN     "tallaElegida" TEXT;

-- AlterTable
ALTER TABLE "Pieza" ADD COLUMN     "coloresDisponibles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tallasDisponibles" TEXT[] DEFAULT ARRAY[]::TEXT[];
