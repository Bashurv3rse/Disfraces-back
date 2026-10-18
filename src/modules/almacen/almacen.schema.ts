import { z } from "zod";
import { TIPOS_PRENDA } from "../disfraces/disfraces.schema";
import { normalizarTalla, tallaValida } from "../../common/tallas";

const MAX_UNIDADES_POR_OPERACION = 300;

export const agregarPiezasSchema = z
  .object({
    nombre: z.string().trim().min(2, "Indica el nombre de la pieza").max(80, "El nombre es demasiado largo"),
    tipo: z.enum(TIPOS_PRENDA),
    color: z.string().trim().min(2, "Indica el color").max(30, "El color es demasiado largo"),
    tallas: z
      .array(
        z.object({
          talla: z.string().trim().min(1, "Indica la talla").max(10),
          cantidad: z
            .number()
            .int("La cantidad debe ser un número entero")
            .min(1, "La cantidad mínima es 1")
            .max(50, "Máximo 50 unidades por talla"),
        })
      )
      .min(1, "Agrega al menos una talla con su cantidad")
      .max(14, "Demasiadas tallas en una sola operación"),
  })
  .superRefine((datos, ctx) => {
    const vistas = new Set<string>();
    datos.tallas.forEach((t, i) => {
      const talla = normalizarTalla(datos.tipo, t.talla);
      if (!tallaValida(datos.tipo, talla)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tallas", i, "talla"],
          message: `La talla «${t.talla}» no es válida para este tipo de prenda`,
        });
      } else if (vistas.has(talla)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tallas", i, "talla"],
          message: `La talla «${talla}» está repetida`,
        });
      }
      vistas.add(talla);
    });

    const total = datos.tallas.reduce((suma, t) => suma + t.cantidad, 0);
    if (total > MAX_UNIDADES_POR_OPERACION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tallas"],
        message: `Máximo ${MAX_UNIDADES_POR_OPERACION} unidades por operación`,
      });
    }
  });

export const retirarPiezasSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  tipo: z.enum(TIPOS_PRENDA),
  color: z.string().trim().min(2).max(30),
  talla: z.string().trim().min(1).max(10),
  cantidad: z.number().int().min(1).max(50),
});

export type AgregarPiezasInput = z.infer<typeof agregarPiezasSchema>;
export type RetirarPiezasInput = z.infer<typeof retirarPiezasSchema>;