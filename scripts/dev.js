import { createServer as createViteServer } from 'vite';
import { createAppServer } from '../server/index.js';

const apiPort = Number(process.env.API_PORT || 3000);
const frontendPort = Number(process.env.VITE_PORT || 5173);
const backend = createAppServer();
let frontend;
let isShuttingDown = false;

async function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (frontend) await frontend.close();
  if (backend.listening) {
    await new Promise((resolve) => backend.close(resolve));
  }
  process.exitCode = exitCode;
}

backend.once('error', (error) => {
  console.error(`Unable to start API server on port ${apiPort}:`, error);
  void shutdown(1);
});

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

backend.listen(apiPort, async () => {
  try {
    frontend = await createViteServer({ server: { port: frontendPort } });
    await frontend.listen();
    console.log(`CampusTrace API listening on http://localhost:${apiPort}`);
    frontend.printUrls();
  } catch (error) {
    console.error('Unable to start the Vite frontend:', error);
    await shutdown(1);
  }
});
