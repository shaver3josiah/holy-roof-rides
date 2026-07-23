// Deacon desktop portal — one self-contained HTML file, served by the same
// server the app talks to (same origin, no CORS, no build step). The file
// lives at server/portal/index.html and is read once at startup.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORTAL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'portal', 'index.html');

export default async function portalRoutes(app) {
  let html;
  try {
    html = readFileSync(PORTAL_PATH, 'utf8');
  } catch {
    html = null; // portal file missing — route still responds with a hint
  }

  app.get('/portal', async (req, reply) => {
    if (!html) return reply.code(404).send({ error: 'Portal not built (server/portal/index.html missing)' });
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
