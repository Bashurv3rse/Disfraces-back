-- CreateTable
CREATE TABLE "EventoDisfraz" (
    "id" TEXT NOT NULL,
    "disfrazId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "prendaId" TEXT,
    "usuarioId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoDisfraz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoDisfraz_disfrazId_fecha_idx" ON "EventoDisfraz"("disfrazId", "fecha");

-- AddForeignKey
ALTER TABLE "EventoDisfraz" ADD CONSTRAINT "EventoDisfraz_disfrazId_fkey" FOREIGN KEY ("disfrazId") REFERENCES "DisfrazFisico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
