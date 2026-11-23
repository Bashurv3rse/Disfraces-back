import { StripePasarela } from "./stripe.pasarela";
import type { PasarelaPago } from "./pasarela-pago";

// Punto único donde se decide QUÉ pasarela usa la aplicación (raíz de composición).
// Los servicios piden la pasarela aquí y nunca construyen una por su cuenta.
let actual: PasarelaPago = new StripePasarela(process.env.STRIPE_SECRET_KEY as string);

export function pasarelaDePago(): PasarelaPago {
  return actual;
}

// Para sustituir la pasarela (pruebas con un doble, u otro proveedor en el futuro).
export function usarPasarela(pasarela: PasarelaPago): void {
  actual = pasarela;
}
