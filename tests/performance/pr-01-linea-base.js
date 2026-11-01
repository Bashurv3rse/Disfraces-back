
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const response = http.get(
    'https://disfraces-api.duckdns.org/api/disfraces',
    { timeout: '10s' }
  );

  check(response, {
    'PR-01: HTTP 200': (r) => r.status === 200,
    'PR-01: respuesta menor a 2 segundos': (r) =>
      r.timings.duration < 2000,
  });

  sleep(1);
}
