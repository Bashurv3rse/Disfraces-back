-- AlterTable
ALTER TABLE "Alquiler" ADD COLUMN     "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "detalleDescuento" TEXT;

-- CreateTable
CREATE TABLE "Promocion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "porcentaje" INTEGER NOT NULL,
    "codigo" TEXT,
    "minDias" INTEGER,
    "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tipoDisfraz" TEXT,
    "temporadaEvento" TEXT,
    "vigenteDesde" TIMESTAMP(3),
    "vigenteHasta" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promocion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promocion_codigo_key" ON "Promocion"("codigo");
