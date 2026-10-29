// Logger de auditoría — formato JSON estructurado (timestamp, usuario, IP, evento),
// tal como pide la matriz de controles: nunca se registra la contraseña ni el
// token completo, solo metadatos del evento de seguridad.

interface EventoAuditoria {
  evento: string;
  usuarioId?: string;
  email?: string;
  ip?: string;
  detalle?: string;
}

export function registrarEventoSeguridad(datos: EventoAuditoria) {
  const entrada = {
    timestamp: new Date().toISOString(),
    ...datos,
  };
  // En un entorno real esto iría a un archivo rotado o a un servicio como
  // Elastic/Datadog — para el proyecto académico, stdout estructurado basta
  // como evidencia de trazabilidad (control detectivo).
  console.log(JSON.stringify({ tipo: "AUDITORIA", ...entrada }));
}