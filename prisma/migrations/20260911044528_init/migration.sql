/*
  Warnings:

  - You are about to drop the column `colorElegido` on the `Alquiler` table. All the data in the column will be lost.
  - You are about to drop the column `conjuntoId` on the `Alquiler` table. All the data in the column will be lost.
  - You are about to drop the column `tallaElegida` on the `Alquiler` table. All the data in the column will be lost.
  - You are about to drop the column `estadoProducto` on the `Devolucion` table. All the data in the column will be lost.
  - You are about to drop the column `piezaId` on the `OrdenReabastecimiento` table. All the data in the column will be lost.
  - You are about to drop the `AlquilerPieza` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Conjunto` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ConjuntoPieza` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DevolucionPieza` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pieza` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PiezaProveedor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReglaCompatibilidad` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `tipoPrenda` to the `OrdenReabastecimiento` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoPrenda" AS ENUM ('SOMBRERO', 'CAMISA', 'PANTALON', 'FALDA', 'ZAPATO', 'ABRIGO', 'CHALECO', 'ACCESORIO', 'PANUELO', 'TACON');

-- CreateEnum
CREATE TYPE "EstadoPrenda" AS ENUM ('DISPONIBLE', 'DANADA', 'FALTANTE');

-- CreateEnum
CREATE TYPE "EstadoPrendaDevuelta" AS ENUM ('BUEN_ESTADO', 'DANADA', 'FALTANTE');

-- DropForeignKey
ALTER TABLE "Alquiler" DROP CONSTRAINT "Alquiler_conjuntoId_fkey";

-- DropForeignKey
ALTER TABLE "AlquilerPieza" DROP CONSTRAINT "AlquilerPieza_alquilerId_fkey";

-- DropForeignKey
ALTER TABLE "AlquilerPieza" DROP CONSTRAINT "AlquilerPieza_piezaId_fkey";

-- DropForeignKey
ALTER TABLE "Conjunto" DROP CONSTRAINT "Conjunto_creadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "ConjuntoPieza" DROP CONSTRAINT "ConjuntoPieza_conjuntoId_fkey";

-- DropForeignKey
ALTER TABLE "ConjuntoPieza" DROP CONSTRAINT "ConjuntoPieza_piezaId_fkey";

-- DropForeignKey
ALTER TABLE "DevolucionPieza" DROP CONSTRAINT "DevolucionPieza_devolucionId_fkey";

-- DropForeignKey
ALTER TABLE "DevolucionPieza" DROP CONSTRAINT "DevolucionPieza_piezaId_fkey";

-- DropForeignKey
ALTER TABLE "OrdenReabastecimiento" DROP CONSTRAINT "OrdenReabastecimiento_piezaId_fkey";

-- DropForeignKey
ALTER TABLE "PiezaProveedor" DROP CONSTRAINT "PiezaProveedor_piezaId_fkey";

-- DropForeignKey
ALTER TABLE "PiezaProveedor" DROP CONSTRAINT "PiezaProveedor_proveedorId_fkey";

-- DropForeignKey
ALTER TABLE "ReglaCompatibilidad" DROP CONSTRAINT "ReglaCompatibilidad_piezaDestinoId_fkey";

-- DropForeignKey
ALTER TABLE "ReglaCompatibilidad" DROP CONSTRAINT "ReglaCompatibilidad_piezaOrigenId_fkey";

-- AlterTable
ALTER TABLE "Alquiler" DROP COLUMN "colorElegido",
DROP COLUMN "conjuntoId",
DROP COLUMN "tallaElegida",
ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';

-- AlterTable
ALTER TABLE "Devolucion" DROP COLUMN "estadoProducto";

-- AlterTable
ALTER TABLE "OrdenReabastecimiento" DROP COLUMN "piezaId",
ADD COLUMN     "tipoPrenda" "TipoPrenda" NOT NULL;

-- DropTable
DROP TABLE "AlquilerPieza";

-- DropTable
DROP TABLE "Conjunto";

-- DropTable
DROP TABLE "ConjuntoPieza";

-- DropTable
DROP TABLE "DevolucionPieza";

-- DropTable
DROP TABLE "Pieza";

-- DropTable
DROP TABLE "PiezaProveedor";

-- DropTable
DROP TABLE "ReglaCompatibilidad";

-- DropEnum
DROP TYPE "EstadoPiezaDevuelta";

-- DropEnum
DROP TYPE "EstadoProductoDevuelto";

-- DropEnum
DROP TYPE "TipoConjunto";

-- DropEnum
DROP TYPE "TipoPieza";

-- CreateTable
CREATE TABLE "DisfrazFisico" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoDisfraz" TEXT NOT NULL,
    "temporadaEvento" TEXT NOT NULL,
    "precioAlquiler" DECIMAL(10,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisfrazFisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prenda" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoPrenda" NOT NULL,
    "color" TEXT NOT NULL,
    "talla" TEXT NOT NULL,
    "estado" "EstadoPrenda" NOT NULL DEFAULT 'DISPONIBLE',
    "disfrazHogarId" TEXT NOT NULL,
    "disfrazActualId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sustitucion" (
    "id" TEXT NOT NULL,
    "prendaId" TEXT NOT NULL,
    "disfrazOrigenId" TEXT NOT NULL,
    "disfrazDestinoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sustitucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrendaProveedor" (
    "id" TEXT NOT NULL,
    "prendaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,

    CONSTRAINT "PrendaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlquilerDisfraz" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "disfrazFisicoId" TEXT NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "AlquilerDisfraz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionPrenda" (
    "id" TEXT NOT NULL,
    "devolucionId" TEXT NOT NULL,
    "prendaId" TEXT NOT NULL,
    "estadoPrenda" "EstadoPrendaDevuelta" NOT NULL,
    "observacion" TEXT,

    CONSTRAINT "DevolucionPrenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prenda_disfrazHogarId_idx" ON "Prenda"("disfrazHogarId");

-- CreateIndex
CREATE INDEX "Prenda_disfrazActualId_idx" ON "Prenda"("disfrazActualId");

-- CreateIndex
CREATE UNIQUE INDEX "PrendaProveedor_prendaId_proveedorId_key" ON "PrendaProveedor"("prendaId", "proveedorId");

-- AddForeignKey
ALTER TABLE "Prenda" ADD CONSTRAINT "Prenda_disfrazHogarId_fkey" FOREIGN KEY ("disfrazHogarId") REFERENCES "DisfrazFisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prenda" ADD CONSTRAINT "Prenda_disfrazActualId_fkey" FOREIGN KEY ("disfrazActualId") REFERENCES "DisfrazFisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sustitucion" ADD CONSTRAINT "Sustitucion_prendaId_fkey" FOREIGN KEY ("prendaId") REFERENCES "Prenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrendaProveedor" ADD CONSTRAINT "PrendaProveedor_prendaId_fkey" FOREIGN KEY ("prendaId") REFERENCES "Prenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrendaProveedor" ADD CONSTRAINT "PrendaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlquilerDisfraz" ADD CONSTRAINT "AlquilerDisfraz_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "Alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlquilerDisfraz" ADD CONSTRAINT "AlquilerDisfraz_disfrazFisicoId_fkey" FOREIGN KEY ("disfrazFisicoId") REFERENCES "DisfrazFisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionPrenda" ADD CONSTRAINT "DevolucionPrenda_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "Devolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionPrenda" ADD CONSTRAINT "DevolucionPrenda_prendaId_fkey" FOREIGN KEY ("prendaId") REFERENCES "Prenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
