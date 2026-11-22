# Guía de evidencias — unidad 4 (ISO 25010)

Cada sección dice qué ejecutar y qué captura pegar en el Word. Los resultados salen de TU ejecución;
no copies números de esta guía.

## 1. Mantenibilidad — testability y analizabilidad (S30)

**Cobertura de la lógica de negocio**
```
cd backend
npm run test:coverage:services
```
Captura: la tabla de texto (columnas % Stmts, % Branch, % Funcs, % Lines). Si baja de 80 % líneas,
75 % funciones o 70 % ramas el comando falla: eso es la «puerta de calidad».

**Complejidad ciclomática antes → después (refactor)**
| Función | Antes | Después |
|---|---|---|
| `obtenerHistorialDisfraz` (disfraces/historial.service.ts) | 33 | 7 funciones, la mayor con 8 |
| `confirmarPago` (pagos/pagos.service.ts) | 21 | 11 |

Medido con un contador propio de ramas (if, for, case, catch, ?:, &&, ||, ??); SonarCloud usa una
regla parecida pero puede dar otro número: cuando lo tengas, usa el de Sonar.
Evidencia de que el comportamiento no cambió: `tests/funcional/historial-linea-tiempo.test.ts`
(prueba de caracterización con snapshot) y `pagos.service.test.ts` (30 pruebas).
Pendiente conocido: `elegirPiezas` (a-medida/armado.service.ts) sigue en 17.

**SonarCloud (en la nube, no consume la VM)**
1. Entra a sonarcloud.io con tu cuenta de GitHub y crea/elige tu organización.
2. «Analyze new project» → elige el repositorio del backend (y otro para el frontend).
3. Anota `organization` y `projectKey` y ponlos en `sonar-project.properties` (reemplaza TU_ORGANIZACION).
4. En SonarCloud: My Account → Security → genera un token.
5. En GitHub: Settings → Secrets and variables → Actions → New secret: `SONAR_TOKEN`.
6. En SonarCloud, desactiva «Automatic Analysis» (usamos el análisis desde GitHub Actions).
7. Haz push: el job «Análisis SonarCloud» corre solo cuando existe el secreto.
Captura: el panel del proyecto (Quality Gate, Bugs, Vulnerabilities, Code Smells, Coverage, Duplications).
Verifica en la documentación de SonarCloud los límites del plan gratuito para tu repositorio.

## 2. Confiabilidad — disponibilidad y recuperación

**Readiness (`/health/ready`)**: responde 200 si la base contesta y 503 si no.
```
curl -i https://TU-DOMINIO/health/ready          # 200 con db: "ok"
sudo systemctl stop postgresql                    # como en CF-04
curl -i https://TU-DOMINIO/health/ready          # 503 con db: "error" (y /health sigue 200)
sudo systemctl start postgresql
curl -i https://TU-DOMINIO/health/ready          # vuelve a 200
```
Captura las tres respuestas y la hora de cada una (tiempo de recuperación).
`/health` sigue igual (el proceso está vivo); no lo cambié para no alterar tus pruebas CF-01..04.

**Disponibilidad medida (uptime)**: crea un monitor gratuito que consulte `/health/ready` cada 5 minutos
(por ejemplo UptimeRobot) y toma captura del porcentaje de uptime tras algunos días.

**Backup y restauración** (capacidad de recuperación de datos):
```
pg_dump -U USUARIO -h localhost -Fc NOMBRE_BD > respaldo.dump
createdb -U USUARIO NOMBRE_BD_restaurada
pg_restore -U USUARIO -d NOMBRE_BD_restaurada respaldo.dump
```
Compara un conteo (`SELECT count(*) FROM "DisfrazFisico";`) en ambas bases y anota cuánto tardó (RTO).

## 3. Flexibilidad — adaptabilidad y escalabilidad (S28)

Requiere Docker en TU PC (no en la VM de 1 GB).
```
cd backend
cp .env.docker.example .env.docker        # completa las claves de prueba
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker --profile semilla run --rm semilla     # datos demo (borra datos de prueba)
curl -i http://localhost:8080/health/ready
```
**Adaptabilidad (portabilidad)**: el mismo código corre en un contenedor sin cambiar la lógica; solo
variables de entorno (`HOST`, `PORT`, `DATABASE_URL`, `TRUST_PROXY`, …). Anota cuánto tardó levantar todo desde cero.

**Escalabilidad horizontal**: instala k6 y compara 1 réplica contra 3:
```
k6 run -e REPLICAS=1 tests/performance/escala-local.js
docker compose --env-file .env.docker up -d --scale backend=3
k6 run -e REPLICAS=3 tests/performance/escala-local.js
```
Guarda `resultados-1-replicas.json` y `resultados-3-replicas.json` y compara req/s, p95 y errores.
En una respuesta, la cabecera `X-Replica` muestra qué réplica atendió (`curl -i http://localhost:8080/api/disfraces`).
Limitación a mencionar: el límite de intentos de login está en memoria de cada réplica, así que con N réplicas
el límite real es N veces mayor (solución: guardar el contador en Redis o en PostgreSQL).

## 4. Rendimiento (S27)

Vuelve a correr tus k6 PR-01..05 con el seed nuevo (~864 unidades) y compara con `RESULTADOS.md`:
el catálogo no tiene paginación, así que puede haber cambiado. Completa en el Word los títulos PR-01..05
que hoy están vacíos con las capturas (consola de k6 y `vmstat`).
Define tu meta (SLA) y justifícala: la clase usa p95 < 300 ms como ejemplo; si tu VM de 1 GB y la distancia
Lima–Azure no lo permiten, escribe el umbral que sí corresponde y por qué.
