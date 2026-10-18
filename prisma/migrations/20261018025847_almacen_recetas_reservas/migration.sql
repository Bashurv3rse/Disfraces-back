-- CreateEnum
CREATE TYPE "OrigenDisfraz" AS ENUM ('CATALOGO', 'ALMACEN', 'A_MEDIDA');

-- CreateEnum
CREATE TYPE "TipoReserva" AS ENUM ('A_MEDIDA', 'AJUSTE_TALLA');

-- AlterTable
ALTER TABLE "DisfrazFisico" ADD COLUMN     "origen" "OrigenDisfraz" NOT NULL DEFAULT 'CATALOGO';

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "tallaCalzado" TEXT,
ADD COLUMN     "tallaRopa" TEXT;

-- CreateTable
CREATE TABLE "Receta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "palabrasClave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "precioDia" DECIMAL(10,2) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaPieza" (
    "id" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" "TipoPrenda" NOT NULL,
    "colores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nombreContiene" TEXT,
    "obligatoria" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecetaPieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "tipo" "TipoReserva" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "disfrazFisicoId" TEXT NOT NULL,
    "recetaId" TEXT,
    "peticion" TEXT,
    "tallaRopa" TEXT,
    "tallaCalzado" TEXT,
    "vence" TIMESTAMP(3) NOT NULL,
    "confirmadaEn" TIMESTAMP(3),
    "liberadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoPrenda" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "prendaId" TEXT NOT NULL,
    "desdeId" TEXT NOT NULL,
    "haciaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoPrenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeticionDisfraz" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "textoNormalizado" TEXT NOT NULL,
    "recetaId" TEXT,
    "atendida" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeticionDisfraz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receta_nombre_key" ON "Receta"("nombre");

-- CreateIndex
CREATE INDEX "RecetaPieza_recetaId_idx" ON "RecetaPieza"("recetaId");

-- CreateIndex
CREATE INDEX "Reserva_disfrazFisicoId_idx" ON "Reserva"("disfrazFisicoId");

-- CreateIndex
CREATE INDEX "Reserva_usuarioId_idx" ON "Reserva"("usuarioId");

-- CreateIndex
CREATE INDEX "MovimientoPrenda_reservaId_idx" ON "MovimientoPrenda"("reservaId");

-- CreateIndex
CREATE INDEX "MovimientoPrenda_prendaId_idx" ON "MovimientoPrenda"("prendaId");

-- CreateIndex
CREATE INDEX "PeticionDisfraz_textoNormalizado_idx" ON "PeticionDisfraz"("textoNormalizado");

-- CreateIndex
CREATE INDEX "DisfrazFisico_origen_idx" ON "DisfrazFisico"("origen");

-- AddForeignKey
ALTER TABLE "RecetaPieza" ADD CONSTRAINT "RecetaPieza_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_disfrazFisicoId_fkey" FOREIGN KEY ("disfrazFisicoId") REFERENCES "DisfrazFisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPrenda" ADD CONSTRAINT "MovimientoPrenda_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPrenda" ADD CONSTRAINT "MovimientoPrenda_prendaId_fkey" FOREIGN KEY ("prendaId") REFERENCES "Prenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeticionDisfraz" ADD CONSTRAINT "PeticionDisfraz_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeticionDisfraz" ADD CONSTRAINT "PeticionDisfraz_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
