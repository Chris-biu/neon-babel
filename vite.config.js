import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// 开发期截图管道：页面 POST dataURL 到 /__cap，落盘到 captures/
function capturePlugin() {
  return {
    name: 'dev-capture',
    configureServer(server) {
      server.middlewares.use('/__cap', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(body);
            const b64 = String(data).replace(/^data:image\/\w+;base64,/, '');
            const dir = resolve(__dirname, 'captures');
            mkdirSync(dir, { recursive: true });
            const safe = String(name || 'cap').replace(/[^\w-]/g, '_');
            writeFileSync(resolve(dir, `${safe}.jpg`), Buffer.from(b64, 'base64'));
            res.end('ok:' + safe);
          } catch (e) {
            res.statusCode = 400;
            res.end('err:' + e.message);
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [capturePlugin()],
});
