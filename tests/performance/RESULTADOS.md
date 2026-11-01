
# Evaluación de rendimiento — DisfracesPro

## Objetivo

Evaluar la eficiencia de desempeño del backend de DisfracesPro
desplegado en Azure, considerando el comportamiento temporal,
la utilización de recursos y la capacidad, de acuerdo con
ISO/IEC 25010.

## Entorno de pruebas

- Aplicación: DisfracesPro
- Backend: Node.js / Express
- Base de datos: PostgreSQL en Azure
- Infraestructura: VM de Azure
- Herramienta de carga: Grafana k6 2.3.0
- Herramienta de monitoreo: vmstat
- Endpoint: GET /api/disfraces
- Tipo de operación: Lectura
- Umbral provisional de latencia: p95 < 2000 ms
- Umbral provisional de errores HTTP: tasa < 5 %

## Resultados de las pruebas

| Caso | Usuarios | Duración | Solicitudes | Promedio (ms) | p95 (ms) | Req/s | Errores | Estado |
|------|----------|----------|-------------|---------------|----------|-------|---------|--------|
| PR-01 | 1 | 30 s | 19 | 558.87 | 577.59 | 0.63 | 0 % | Aprobado |
| PR-02 | 5 | 30 s | 99 | 553.38 | 577.29 | 3.14 | 0 % | Aprobado |
| PR-03 | 10 | 30 s | 195 | 555.91 | 621.91 | 6.19 | 0 % | Aprobado |
| PR-04 | 20 | 30 s | 381 | 566.68 | 679.22 | 12.09 | 0 % | Aprobado |
| PR-05 | 10 | 5 min | 1938 | 547.33 | 555.61 | 6.44 | 0 % | Aprobado |

## Monitoreo de recursos

### PR-03 — 10 usuarios

- CPU inactiva mínima observada: 91 %
- Memoria libre observada: 121–130 MB
- Swap utilizada: 88 MB
- Actividad de swap: 0

### PR-04 — 20 usuarios

- CPU inactiva mínima observada: 78 %
- Memoria libre observada: 119–129 MB
- Swap utilizada: 88 MB
- Actividad de swap: 0

### PR-05 — Estabilidad

- CPU inactiva generalmente entre 93 % y 96 %
- Memoria libre observada: 115–131 MB
- Swap utilizada: 88 MB
- Actividad de swap: 0

## Conclusiones

Las cinco pruebas cumplieron los umbrales provisionales
establecidos para latencia p95 y tasa de errores HTTP.

Se procesaron 2632 solicitudes HTTP acumuladas sin errores
durante las ejecuciones.

El backend mantuvo un comportamiento favorable al incrementar
la carga de 1 a 20 usuarios virtuales.

Durante las pruebas monitoreadas no se observaron señales de
saturación sostenida de CPU ni actividad adicional de swap.

La prueba de estabilidad de cinco minutos finalizó sin errores.

## Limitaciones

- Se evaluó únicamente el endpoint de consulta del catálogo.
- Los resultados no representan la capacidad máxima del sistema.
- No se evaluó escalabilidad horizontal ni automática.
- Los registros de vmstat corresponden a toda la VM.
- No se evaluaron operaciones de autenticación, alquiler o pago.
- Los umbrales utilizados son provisionales.
- La estabilidad de cinco minutos no demuestra disponibilidad
  continua ni ausencia definitiva de fugas de memoria.
