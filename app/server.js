// App mau cho lab CI/CD + Kubernetes.
// - GET /            : trang chao + version + hostname (thay doi khi rollout -> thay tan mat)
// - GET /healthz     : liveness  (k8s restart pod neu fail)
// - GET /readyz      : readiness (k8s ngung route traffic neu chua san sang)
// - GET /metrics     : Prometheus scrape (Grafana ve bieu do)
const express = require('express');
const client = require('prom-client');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
// APP_VERSION do CI ghi vao image (build-arg) -> thay doi moi lan deploy
const VERSION = process.env.APP_VERSION || 'dev';

// --- Prometheus metrics ---
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const httpRequests = new client.Counter({
  name: 'lab_http_requests_total',
  help: 'Tong so request theo route va status',
  labelNames: ['route', 'status'],
  registers: [registry],
});
const httpDuration = new client.Histogram({
  name: 'lab_http_request_duration_seconds',
  help: 'Do tre request (giay)',
  labelNames: ['route'],
  registers: [registry],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer({ route: req.path });
  res.on('finish', () => {
    httpRequests.inc({ route: req.path, status: res.statusCode });
    end();
  });
  next();
});

let ready = false;
setTimeout(() => { ready = true; }, 2000); // gia lap warm-up

app.get('/', (req, res) => {
  res.json({
    message: 'Xin chao tu lab CI/CD + Kubernetes',
    version: VERSION,
    pod: os.hostname(),   // ten pod -> doi khi Argo rollout ban moi
    time: new Date().toISOString(),
  });
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.get('/readyz', (req, res) => res.status(ready ? 200 : 503).send(ready ? 'ready' : 'starting'));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Chi listen khi chay truc tiep (node server.js), KHONG listen khi bi require trong test.
if (require.main === module) {
  app.listen(PORT, () => console.log(`lab-app v${VERSION} listening on :${PORT}`));
}

module.exports = app;
