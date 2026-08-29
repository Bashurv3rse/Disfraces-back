/*
  Warnings:

  - You are about to drop the column `talla` on the `Pieza` table. All the data in the column will be lost.
  - You are about to drop the column `temporada` on the `Pieza` table. All the data in the column will be lost.
  - The `rol` column on the `Usuario` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `precioAlquiler` to the `Pieza` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tallaEEUU` to the `Pieza` table without a default value. This is not possible if the table is not empty.
  - Added the required column `temporadaOriginal` to the `Pieza` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `tipo` on the `Pieza` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'ADMINISTRADOR', 'PROVEEDOR');

-- CreateEnum
CREATE TYPE "TipoPieza" AS ENUM ('SOMBRERO', 'CAMISA_POLO', 'PANTALON', 'ZAPATO_ZAPATILLA', 'ABRIGO', 'CHALECO', 'TRAJE', 'TACON', 'ACCESORIO');

-- CreateEnum
CREATE TYPE "TipoConjunto" AS ENUM ('PREDETERMINADO', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('SOLICITADA', 'EN_CAMINO', 'RECIBIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoAlquiler" AS ENUM ('PENDIENTE', 'ACTIVO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoDevolucion" AS ENUM ('PENDIENTE', 'APROBADA', 'CON_OBSERVACIONES', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoPiezaDevuelta" AS ENUM ('BUEN_ESTADO', 'DANADA', 'FALTANTE');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('APROBADO', 'RECHAZADO', 'REEMBOLSADO');

-- AlterTable
ALTER TABLE "Pieza" DROP COLUMN "talla",
DROP COLUMN "temporada",
ADD COLUMN     "precioAlquiler" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "tallaEEUU" TEXT NOT NULL,
ADD COLUMN     "temporadaOriginal" TEXT NOT NULL,
DROP COLUMN "tipo",
ADD COLUMN     "tipo" "TipoPieza" NOT NULL;

-- AlterTable
ALTER TABLE "Usuario" DROP COLUMN "rol",
ADD COLUMN     "rol" "Rol" NOT NULL DEFAULT 'CLIENTE';

-- CreateTable
CREATE TABLE "Conjunto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoConjunto" NOT NULL,
    "temporadaEvento" TEXT NOT NULL,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConjuntoPieza" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,

    CONSTRAINT "ConjuntoPieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaCompatibilidad" (
    "id" TEXT NOT NULL,
    "piezaOrigenId" TEXT NOT NULL,
    "piezaDestinoId" TEXT NOT NULL,
    "eventoAplicable" TEXT NOT NULL,

    CONSTRAINT "ReglaCompatibilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PiezaProveedor" (
    "id" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,

    CONSTRAINT "PiezaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenReabastecimiento" (
    "id" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'SOLICITADA',
    "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntrega" TIMESTAMP(3),

    CONSTRAINT "OrdenReabastecimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alquiler" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "conjuntoId" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoAlquiler" NOT NULL DEFAULT 'PENDIENTE',
    "montoTotal" DECIMAL(10,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alquiler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlquilerPieza" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "AlquilerPieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devolucion" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "fechaDevolucion" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoDevolucion" NOT NULL DEFAULT 'PENDIENTE',
    "penalidad" DECIMAL(10,2),
    "observaciones" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionPieza" (
    "id" TEXT NOT NULL,
    "devolucionId" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "estadoPieza" "EstadoPiezaDevuelta" NOT NULL,
    "observacion" TEXT,

    CONSTRAINT "DevolucionPieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "alquilerId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'TARJETA_SIMULADA',
    "estado" "EstadoPago" NOT NULL,
    "comprobante" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConjuntoPieza_conjuntoId_piezaId_key" ON "ConjuntoPieza"("conjuntoId", "piezaId");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaCompatibilidad_piezaOrigenId_piezaDestinoId_eventoApli_key" ON "ReglaCompatibilidad"("piezaOrigenId", "piezaDestinoId", "eventoAplicable");

-- CreateIndex
CREATE UNIQUE INDEX "PiezaProveedor_piezaId_proveedorId_key" ON "PiezaProveedor"("piezaId", "proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "Devolucion_alquilerId_key" ON "Devolucion"("alquilerId");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_alquilerId_key" ON "Pago"("alquilerId");

-- AddForeignKey
ALTER TABLE "Conjunto" ADD CONSTRAINT "Conjunto_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConjuntoPieza" ADD CONSTRAINT "ConjuntoPieza_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConjuntoPieza" ADD CONSTRAINT "ConjuntoPieza_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaCompatibilidad" ADD CONSTRAINT "ReglaCompatibilidad_piezaOrigenId_fkey" FOREIGN KEY ("piezaOrigenId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaCompatibilidad" ADD CONSTRAINT "ReglaCompatibilidad_piezaDestinoId_fkey" FOREIGN KEY ("piezaDestinoId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaProveedor" ADD CONSTRAINT "PiezaProveedor_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaProveedor" ADD CONSTRAINT "PiezaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenReabastecimiento" ADD CONSTRAINT "OrdenReabastecimiento_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenReabastecimiento" ADD CONSTRAINT "OrdenReabastecimiento_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alquiler" ADD CONSTRAINT "Alquiler_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alquiler" ADD CONSTRAINT "Alquiler_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlquilerPieza" ADD CONSTRAINT "AlquilerPieza_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "Alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlquilerPieza" ADD CONSTRAINT "AlquilerPieza_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "Alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionPieza" ADD CONSTRAINT "DevolucionPieza_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "Devolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionPieza" ADD CONSTRAINT "DevolucionPieza_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_alquilerId_fkey" FOREIGN KEY ("alquilerId") REFERENCES "Alquiler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
