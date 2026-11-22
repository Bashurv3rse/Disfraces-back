// Prueba de escalabilidad (S28): sube la carga hasta 100 usuarios virtuales contra el entorno Docker local.
// Se ejecuta DOS veces para comparar: con 1 réplica y con 3 réplicas.
//
//   docker compose --env-file .env.docker up --build -d                 # 1 réplica
//   k6 run -e REPLICAS=1 tests/performance/escala-local.js
//   docker compose --env-file .env.docker up -d --scale backend=3       # 3 réplicas
//   k6 run -e REPLICAS=3 tests/performance/escala-local.js
//
// Cada ejecución guarda resultados-<REPLICAS>-replicas.json con el resumen para el informe.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const REPLICAS = __ENV.REPLICAS || 'x';

export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const respuesta = http.get(`${BASE_URL}/api/disfraces`, { timeout: '10s' });
  check(respuesta, {
    'HTTP 200': (r) => r.status === 200,
    'respuesta menor a 1 segundo': (r) => r.timings.duration < 1000,
  });
  sleep(1);
}

export function handleSummary(datos) {
  const d = datos.metrics.http_req_duration.values;
  const resumen = {
    replicas: REPLICAS,
    solicitudes: datos.metrics.http_reqs.values.count,
    reqPorSegundo: Number(datos.metrics.http_reqs.values.rate.toFixed(2)),
    promedioMs: Number(d.avg.toFixed(2)),
    p95Ms: Number(d['p(95)'].toFixed(2)),
    maxMs: Number(d.max.toFixed(2)),
    erroresPct: Number((datos.metrics.http_req_failed.values.rate * 100).toFixed(2)),
  };
  console.log(JSON.stringify(resumen, null, 2));
  return { [`resultados-${REPLICAS}-replicas.json`]: JSON.stringify(resumen, null, 2) };
}
