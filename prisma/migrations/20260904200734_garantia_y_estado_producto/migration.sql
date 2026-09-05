-- CreateEnum
CREATE TYPE "EstadoProductoDevuelto" AS ENUM ('BUENO', 'MALO');

-- AlterTable
ALTER TABLE "Alquiler" ADD COLUMN     "montoGarantia" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Devolucion" ADD COLUMN     "estadoProducto" "EstadoProductoDevuelto";
