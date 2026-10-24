import { createServer as createHttpServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { validateClaim, validateItem } from './validation.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');
const defaultDataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(serverDirectory, 'data');
const defaultItemsFile = path.join(defaultDataDirectory, 'default-items.json');
const maxBodySize = 16 * 1024;

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createApp({
  dataDirectory = defaultDataDirectory,
  staticDirectory = path.join(projectDirectory, 'dist'),
} = {}) {
  const app = express();
  const apiRouter = express.Router();
  const itemsFile = path.join(dataDirectory, 'items.json');
  const claimsFile = path.join(dataDirectory, 'claims.json');

  async function loadItems() {
    const items = await readJson(itemsFile);
    if (items !== null) {
      if (!Array.isArray(items)) throw new Error('Stored campus records must be a JSON array.');
      return items;
    }
    const defaults = await readJson(defaultItemsFile);
    if (!Array.isArray(defaults)) throw new Error('Default campus records are missing or invalid.');
    await writeJson(itemsFile, defaults);
    return defaults;
  }

  app.disable('x-powered-by');
  app.use(express.json({ limit: maxBodySize }));

  apiRouter.get('/items', asyncRoute(async (request, response) => {
    response.json({ items: await loadItems() });
  }));

  apiRouter.post('/items', asyncRoute(async (request, response) => {
    const { data, errors } = validateItem(request.body);
    if (Object.keys(errors).length) {
      response.status(400).json({ message: 'Please correct the highlighted fields.', errors });
      return;
    }
    const items = await loadItems();
    const item = { id: Date.now(), ...data, date: 'Just now' };
    await writeJson(itemsFile, [item, ...items]);
    response.status(201).json({ message: 'Item report submitted successfully.', item });
  }));

  apiRouter.post('/claims', asyncRoute(async (request, response) => {
    const { data, errors } = validateClaim(request.body);
    if (Object.keys(errors).length) {
      response.status(400).json({ message: 'Please correct the highlighted fields.', errors });
      return;
    }
    const claims = (await readJson(claimsFile)) ?? [];
    if (!Array.isArray(claims)) throw new Error('Stored claims must be a JSON array.');
    const claim = { id: Date.now(), ...data, submittedAt: new Date().toISOString() };
    await writeJson(claimsFile, [claim, ...claims]);
    response.status(201).json({
      message: 'Claim request submitted! Campus Security will verify your ownership.',
      claim: { id: claim.id, submittedAt: claim.submittedAt },
    });
  }));

  apiRouter.post('/reset', asyncRoute(async (request, response) => {
    const defaults = await readJson(defaultItemsFile);
    if (!Array.isArray(defaults)) throw new Error('Default campus records are missing or invalid.');
    await writeJson(itemsFile, defaults);
    response.json({ message: 'Campus records reset to the default list.', items: defaults });
  }));

  apiRouter.delete('/items/:id', asyncRoute(async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ message: 'Campus record ID must be numeric.' });
      return;
    }
    const items = await loadItems();
    const id = Number(request.params.id);
    const updatedItems = items.filter((item) => item.id !== id);
    if (updatedItems.length === items.length) {
      response.status(404).json({ message: 'Campus record not found.' });
      return;
    }
    await writeJson(itemsFile, updatedItems);
    response.json({ message: 'Campus record removed successfully.' });
  }));

  apiRouter.use((request, response) => {
    response.status(404).json({ message: 'API route not found.' });
  });

  app.use('/api', apiRouter);
  app.use(express.static(staticDirectory));
  app.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.status(405).json({ message: 'Method not allowed.' });
      return;
    }
    if (path.extname(request.path)) {
      response.status(404).json({ message: 'File not found.' });
      return;
    }

    const indexPath = path.join(staticDirectory, 'index.html');
    if (!existsSync(indexPath)) {
      response.status(503).json({ message: 'Frontend build not found. Run npm run build first.' });
      return;
    }
    response.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ message: 'Request body is too large.' });
      return;
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      response.status(400).json({ message: 'Request body must contain valid JSON.' });
      return;
    }
    console.error('Request failed:', error);
    response.status(500).json({ message: 'An unexpected server error occurred.' });
  });

  return app;
}

export function createAppServer(options) {
  return createHttpServer(createApp(options));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, () => {
    console.log(`CampusTrace Express server listening on http://localhost:${port}`);
  });
}
