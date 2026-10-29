import { z } from "zod";

export const TIPOS_PRENDA = [
  "SOMBRERO",
  "CAMISA",
  "PANTALON",
  "FALDA",
  "ZAPATO",
  "ABRIGO",
  "CHALECO",
  "ACCESORIO",
  "PANUELO",
  "TACON",
] as const;

const prendaSchema = z.object({
  nombre: z.string().trim().min(1, "Cada prenda necesita un nombre"),
  tipo: z.enum(TIPOS_PRENDA),
  color: z.string().trim().min(1, "Cada prenda necesita un color"),
  talla: z.string().trim().min(1, "Cada prenda necesita una talla"),
});

// La imagen es opcional y puede ser una URL http(s) o una ruta local del propio frontend
// (/disfraces-img/x.jpg). Se rechazan esquemas como javascript: y rutas "//host" o "/\host",
// que el navegador interpreta como una URL externa.
const imagenSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(500, "La ruta de la imagen es demasiado larga")
    .refine(
      (v) => /^https?:\/\/\S+$/i.test(v) || /^\/(?![/\\])\S*$/.test(v),
      "La imagen debe ser una URL http(s) o una ruta que empiece con /"
    )
    .optional()
);

export const crearDisfrazSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  familia: z.string().trim().min(2, "La familia debe tener al menos 2 caracteres").optional(),
  grupoCompatibilidad: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El grupo solo admite minúsculas, números y guiones (ej. capa-halloween)")
    .optional(),
  tipoDisfraz: z.string().trim().min(2, "Indica el tipo de disfraz"),
  temporadaEvento: z
    .string()
    .trim()
    .min(1, "Indica la temporada o evento")
    .transform((s) => s.toLowerCase()),
  precioAlquiler: z.number().positive("El precio debe ser mayor que 0").max(100000),
  imagenUrl: imagenSchema,
  prendas: z
    .array(prendaSchema)
    .min(1, "Debe incluir al menos una prenda")
    .max(20, "Un disfraz no puede tener más de 20 prendas"),
});

export const actualizarEstadoManualSchema = z.object({
  estado: z.enum(["EN_REPARACION", "SUSPENDIDO"]).nullable(),
});

export const actualizarPrendaSchema = z.object({
  estado: z.enum(["DISPONIBLE", "DANADA", "FALTANTE"]).optional(),
  calidad: z.string().min(1).optional(),
});

export const confirmarPrestamoSchema = z.object({
  prendaDonanteId: z.string().uuid(),
});

export type CrearDisfrazInput = z.infer<typeof crearDisfrazSchema>;