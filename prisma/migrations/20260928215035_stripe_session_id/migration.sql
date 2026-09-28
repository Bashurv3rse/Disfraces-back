/*
  Warnings:

  - A unique constraint covering the columns `[stripeSessionId]` on the table `Alquiler` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Alquiler" ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Alquiler_stripeSessionId_key" ON "Alquiler"("stripeSessionId");
