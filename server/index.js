import { createServer as createHttpServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createItemsDatabase } from './database.js';
import { validateClaim, validateItem } from './validation.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');
const defaultDataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(serverDirectory, 'data');
const defaultItemsFile = path.join(serverDirectory, 'data', 'default-items.json');
const maxBodySize = 16 * 1024;
const adminSessionCookie = 'campus_admin_session';
const adminSessionDurationMs = 8 * 60 * 60 * 1000;
const claimStatuses = new Set(['Pending', 'Approved', 'Rejected']);
const localAdminPassword = process.env.NODE_ENV === 'production'
  ? process.env.ADMIN_PASSWORD
  : process.env.ADMIN_PASSWORD ?? '123456789';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function loadClaims(claimsFile) {
  let contents;
  try {
    contents = await readFile(claimsFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (contents.trim() === '') return [];

  const claims = JSON.parse(contents);
  if (!Array.isArray(claims)) throw new Error('Stored claims must be a JSON array.');
  return claims;
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createApp({
  dataDirectory = defaultDataDirectory,
  staticDirectory = path.join(projectDirectory, 'dist'),
  adminPassword = localAdminPassword,
} = {}) {
  const app = express();
  const apiRouter = express.Router();
  const itemsDatabase = createItemsDatabase(dataDirectory, defaultItemsFile);
  const claimsFile = path.join(dataDirectory, 'claims.json');
  const adminSessions = new Map();
  app.locals.itemsDatabase = itemsDatabase;

  app.disable('x-powered-by');
  app.use(express.json({ limit: maxBodySize }));

  apiRouter.post('/admin/login', asyncRoute(async (request, response) => {
    if (!adminPassword) {
      response.status(503).json({ message: 'Admin login is not configured. Set the ADMIN_PASSWORD environment variable.' });
      return;
    }
    const providedPassword = typeof request.body?.password === 'string' ? request.body.password : '';
    const providedBuffer = Buffer.from(providedPassword);
    const expectedBuffer = Buffer.from(adminPassword);
    const passwordMatches = providedBuffer.length === expectedBuffer.length
      && timingSafeEqual(providedBuffer, expectedBuffer);
    if (!passwordMatches) {
      response.status(401).json({ message: 'Incorrect admin password.' });
      return;
    }

    const sessionId = randomBytes(32).toString('hex');
    adminSessions.set(sessionId, Date.now() + adminSessionDurationMs);
    const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader(
      'Set-Cookie',
      `${adminSessionCookie}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${adminSessionDurationMs / 1000}${secureCookie}`,
    );
    response.json({ message: 'Admin login successful.' });
  }));

  apiRouter.use('/admin', (request, response, next) => {
    const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim()) ?? [];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${adminSessionCookie}=`));
    const sessionId = sessionCookie?.slice(adminSessionCookie.length + 1);
    const expiresAt = sessionId ? adminSessions.get(sessionId) : undefined;
    if (!expiresAt || expiresAt <= Date.now()) {
      if (sessionId) adminSessions.delete(sessionId);
      response.status(401).json({ message: 'Admin login required.' });
      return;
    }
    next();
  });

  apiRouter.get('/admin/session', (request, response) => {
    response.json({ authenticated: true });
  });

  apiRouter.post('/admin/logout', (request, response) => {
    const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim()) ?? [];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${adminSessionCookie}=`));
    const sessionId = sessionCookie?.slice(adminSessionCookie.length + 1);
    if (sessionId) adminSessions.delete(sessionId);
    response.setHeader('Set-Cookie', `${adminSessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    response.json({ message: 'Admin logged out.' });
  });

  apiRouter.get('/admin/claims', asyncRoute(async (request, response) => {
    const claims = await loadClaims(claimsFile);
    response.json({
      claims: claims.map((claim) => ({ ...claim, status: claim.status ?? 'Pending' })),
    });
  }));

  apiRouter.get('/admin/items', asyncRoute(async (request, response) => {
    response.json({ items: itemsDatabase.list() });
  }));

  apiRouter.patch('/admin/claims/:id', asyncRoute(async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ message: 'Claim ID must be numeric.' });
      return;
    }
    const { status } = request.body ?? {};
    if (!claimStatuses.has(status)) {
      response.status(400).json({ message: 'Choose Pending, Approved, or Rejected.' });
      return;
    }
    const claims = await loadClaims(claimsFile);
    const claimIndex = claims.findIndex((claim) => String(claim.id) === request.params.id);
    if (claimIndex === -1) {
      response.status(404).json({ message: 'Claim request not found.' });
      return;
    }
    claims[claimIndex] = { ...claims[claimIndex], status, reviewedAt: new Date().toISOString() };
    await writeJson(claimsFile, claims);
    response.json({ message: 'Claim status updated.', claim: claims[claimIndex] });
  }));

  apiRouter.get('/items', asyncRoute(async (request, response) => {
    const [items, claims] = await Promise.all([itemsDatabase.list(), loadClaims(claimsFile)]);
    const completedItemIds = new Set(
      claims.filter((claim) => claim.status === 'Approved').map((claim) => claim.itemId),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      items: items.map((item) => (
        completedItemIds.has(item.id) ? { ...item, status: 'Complete' } : item
      )),
    });
  }));

  apiRouter.get('/items/:id', asyncRoute(async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ message: 'Campus record ID must be numeric.' });
      return;
    }
    const id = Number(request.params.id);
    const item = itemsDatabase.get(id);
    if (!item) {
      response.status(404).json({ message: 'Campus record not found.' });
      return;
    }
    const claims = await loadClaims(claimsFile);
    const isComplete = claims.some((claim) => claim.itemId === id && claim.status === 'Approved');
    response.setHeader('Cache-Control', 'no-store');
    response.json({ item: isComplete ? { ...item, status: 'Complete' } : item });
  }));

  apiRouter.post('/items', asyncRoute(async (request, response) => {
    const { data, errors } = validateItem(request.body);
    if (Object.keys(errors).length) {
      response.status(400).json({ message: 'Please correct the highlighted fields.', errors });
      return;
    }
    const item = { id: itemsDatabase.nextId(), ...data, date: 'Just now' };
    itemsDatabase.create({ ...item, sort_order: itemsDatabase.nextSortOrder() });
    response.status(201).json({ message: 'Item report submitted successfully.', item });
  }));

  apiRouter.put('/items/:id', asyncRoute(async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ message: 'Campus record ID must be numeric.' });
      return;
    }
    const id = Number(request.params.id);
    const currentItem = itemsDatabase.get(id);
    if (!currentItem) {
      response.status(404).json({ message: 'Campus record not found.' });
      return;
    }
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      response.status(400).json({ message: 'Request body must be a JSON object.' });
      return;
    }
    const { data, errors } = validateItem(request.body);
    if (Object.keys(errors).length) {
      response.status(400).json({ message: 'Please correct the highlighted fields.', errors });
      return;
    }
    const item = { id, ...data, date: currentItem.date };
    itemsDatabase.update(item);
    response.json({ message: 'Campus record updated successfully.', item });
  }));

  apiRouter.patch('/items/:id', asyncRoute(async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ message: 'Campus record ID must be numeric.' });
      return;
    }
    const id = Number(request.params.id);
    const currentItem = itemsDatabase.get(id);
    if (!currentItem) {
      response.status(404).json({ message: 'Campus record not found.' });
      return;
    }
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      response.status(400).json({ message: 'Request body must be a JSON object.' });
      return;
    }
    const { data, errors } = validateItem({ ...currentItem, ...request.body });
    if (Object.keys(errors).length) {
      response.status(400).json({ message: 'Please correct the highlighted fields.', errors });
      return;
    }
    const item = { id, ...data, date: currentItem.date };
    itemsDatabase.update(item);
    response.json({ message: 'Campus record updated successfully.', item });
  }));

  apiRouter.post('/claims', asyncRoute(async (request, response) => {
    const { data, errors } = validateClaim(request.body);
    if (Object.keys(errors).length) {
      response.status(400).json({ message: 'Please correct the highlighted fields.', errors });
      return;
    }
    const item = itemsDatabase.get(data.itemId);
    if (!item || item.type !== 'Found') {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        errors: { itemId: 'Choose an available found item to claim.' },
      });
      return;
    }
    const claims = await loadClaims(claimsFile);
    const claim = {
      id: Date.now(),
      ...data,
      itemTitle: item.title,
      status: 'Pending',
      submittedAt: new Date().toISOString(),
    };
    await writeJson(claimsFile, [claim, ...claims]);
    response.status(201).json({
      message: 'Claim request submitted! Campus Security will verify your ownership.',
      claim: { id: claim.id, itemId: claim.itemId, itemTitle: claim.itemTitle, submittedAt: claim.submittedAt },
    });
  }));

  apiRouter.post('/reset', asyncRoute(async (request, response) => {
    const defaults = JSON.parse(await readFile(defaultItemsFile, 'utf8'));
    if (!Array.isArray(defaults)) throw new Error('Default campus records are missing or invalid.');
    itemsDatabase.replaceAll(defaults);
    response.json({ message: 'Campus records reset to the default list.', items: defaults });
  }));

  apiRouter.delete('/items/:id', asyncRoute(async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ message: 'Campus record ID must be numeric.' });
      return;
    }
    const id = Number(request.params.id);
    const result = itemsDatabase.delete(id);
    if (result.changes === 0) {
      response.status(404).json({ message: 'Campus record not found.' });
      return;
    }
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
  const app = createApp(options);
  const server = createHttpServer(app);
  server.once('close', () => app.locals.itemsDatabase?.close());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, () => {
    console.log(`CampusTrace Express server listening on http://localhost:${port}`);
  });
}
