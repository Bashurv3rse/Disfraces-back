const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SEGURIDAD: DATABASE_URL no está definida para las pruebas de integración."
  );
}

let databaseName: string;

try {
  const url = new URL(databaseUrl);

  databaseName = url.pathname.replace(/^\//, "");
} catch {
  throw new Error(
    "SEGURIDAD: DATABASE_URL no tiene un formato válido."
  );
}

if (databaseName !== "disfraz_test_db") {
  throw new Error(
    `SEGURIDAD: las pruebas de integración solo pueden ejecutarse sobre ` +
      `"disfraz_test_db". Base detectada: "${databaseName}".`
  );
}

if (process.env.NODE_ENV !== "test") {
  throw new Error(
    `SEGURIDAD: NODE_ENV debe ser "test". Valor detectado: ` +
      `"${process.env.NODE_ENV}".`
  );
}