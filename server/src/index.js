import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import authRoutes from './auth.js';
import rideRoutes from './rides.js';
import adminRoutes from './admin.js';
import liveRoutes from './live.js';

/** Build the app (exported for tests). Pass ':memory:' dbPath in tests. */
export function buildApp({ dbPath, bootstrapCode } = {}) {
  const db = openDb(dbPath);
  // Redact ?token= from request logs — the /live WebSocket authenticates via
  // query string, and session tokens must never reach log files.
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT
        ? false
        : {
            serializers: {
              req(req) {
                return {
                  method: req.method,
                  url: req.url.replace(/([?&]token=)[^&]+/g, '$1REDACTED'),
                  remoteAddress: req.ip,
                };
              },
            },
          },
  });

  // First person to join with this code becomes the founding deacon.
  const bootstrap = bootstrapCode ?? process.env.HRR_BOOTSTRAP_CODE ?? randomBytes(4).toString('hex').toUpperCase();

  app.decorate('db', db);
  app.decorate('bootstrapCode', bootstrap);

  app.get('/health', async () => ({ ok: true }));

  app.register(websocket);
  app.register(authRoutes);
  app.register(rideRoutes);
  app.register(adminRoutes);
  app.register(liveRoutes);

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const app = buildApp({});
  const port = Number(process.env.PORT ?? 8787);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    const users = app.db.prepare('SELECT COUNT(*) AS n FROM users').get();
    if (users.n === 0) {
      app.log.info(`No members yet. Founding-deacon bootstrap code: ${app.bootstrapCode}`);
    }
  });
}
