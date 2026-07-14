// Test toi thieu de CI co buoc `npm test` that (node --test, khong can framework).
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.PORT = 0; // cong ngau nhien cho test
const app = require('./server');

test('GET /healthz tra ve 200 ok', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const body = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, d }));
    });
  });
  server.close();
  assert.strictEqual(body.status, 200);
  assert.strictEqual(body.d, 'ok');
});
