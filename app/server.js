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

// JSON thô cho máy / smoke test
app.get('/api', (req, res) => {
  res.json({ status: 'live', version: VERSION, host: os.hostname(),
    uptime_s: Math.round(process.uptime()), time: new Date().toISOString() });
});

// Trang trạng thái cho người xem (live demo)
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Live demo · cicd-k8s-lab</title>
<style>
:root{--bg:#0d0e12;--card:#181b22;--ink:#edeef2;--mut:#969cab;--acc:#9d8cff;--ok:#34d399;--hair:#262a33}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:
radial-gradient(1200px 600px at 50% -10%,#1a1630,transparent),var(--bg);color:var(--ink);
font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
.card{width:100%;max-width:560px;background:var(--card);border:1px solid var(--hair);border-radius:18px;
padding:30px;box-shadow:0 20px 60px -20px #000}
.chip{display:inline-flex;align-items:center;gap:.5em;font:600 .78rem ui-monospace,Menlo,monospace;
color:#062;background:var(--ok);padding:.3em .7em;border-radius:999px}
.dot{width:8px;height:8px;border-radius:50%;background:#062;animation:p 1.8s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(0,60,40,.5)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
h1{font-size:1.5rem;letter-spacing:-.02em;margin:16px 0 6px}p.sub{color:var(--mut);margin:0 0 20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--hair);border:1px solid var(--hair);
border-radius:12px;overflow:hidden;margin:18px 0}
.cell{background:var(--card);padding:13px 15px}.k{font:.68rem ui-monospace,monospace;color:var(--mut);
text-transform:uppercase;letter-spacing:.08em}.v{font:600 .95rem ui-monospace,monospace;margin-top:3px;word-break:break-all}
.v.acc{color:var(--acc)}
.flow{font:.72rem ui-monospace,monospace;color:var(--mut);background:#0e1017;border:1px solid var(--hair);
border-radius:10px;padding:12px 14px;line-height:1.9;overflow-x:auto}
.flow b{color:var(--acc)}
.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
a{flex:1;text-align:center;text-decoration:none;color:var(--ink);border:1px solid var(--hair);
border-radius:10px;padding:.7em 1em;font:.85rem ui-monospace,monospace}a:hover{border-color:var(--acc);color:var(--acc)}
a.pri{background:var(--acc);color:#0d0e12;border-color:transparent}
</style></head><body>
<div class="card">
  <span class="chip"><span class="dot"></span>LIVE</span>
  <h1>Container này đang chạy thật.</h1>
  <p class="sub">Và nó được <b style="color:var(--ink)">shipped tự động</b> bởi pipeline CI/CD của tôi — không deploy tay.</p>
  <div class="grid">
    <div class="cell"><div class="k">version (git sha)</div><div class="v acc">${VERSION}</div></div>
    <div class="cell"><div class="k">instance / host</div><div class="v">${os.hostname()}</div></div>
    <div class="cell"><div class="k">uptime</div><div class="v" id="up">${Math.round(process.uptime())}s</div></div>
    <div class="cell"><div class="k">server time</div><div class="v" id="clk">${new Date().toISOString().slice(11,19)} UTC</div></div>
  </div>
  <div class="flow">git push &nbsp;<b>→</b>&nbsp; GitHub Actions (test·build) &nbsp;<b>→</b>&nbsp; registry<br>
    &nbsp;<b>→</b>&nbsp; Argo CD auto-sync &nbsp;<b>→</b>&nbsp; Kubernetes rolling update &nbsp;<b>→</b>&nbsp; <b>bạn đang xem</b></div>
  <div class="links">
    <a class="pri" href="https://tranletrungkien1705.github.io/">← Portfolio</a>
    <a href="https://github.com/Tranletrungkien1705/cicd-k8s-lab">◈ Source</a>
    <a href="/api">{ } /api</a>
  </div>
</div>
<script>
  var up=${Math.round(process.uptime())};
  setInterval(function(){up++;document.getElementById('up').textContent=up+'s';
    document.getElementById('clk').textContent=new Date().toISOString().slice(11,19)+' UTC';},1000);
</script>
</body></html>`);
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
