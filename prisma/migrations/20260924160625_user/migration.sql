/*
  Warnings:

  - Added the required column `direccion` to the `Usuario` table without a default value. This is not possible if the table is not empty.
  - Added the required column `telefono` to the `Usuario` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "direccion" TEXT NOT NULL,
ADD COLUMN     "telefono" TEXT NOT NULL;
