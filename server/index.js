import { createServer as createHttpServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateClaim, validateItem } from './validation.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');
const defaultDataDirectory = path.join(serverDirectory, 'data');
const defaultItemsFile = path.join(defaultDataDirectory, 'default-items.json');
const maxBodySize = 16 * 1024;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

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

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodySize) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function createAppServer({
  dataDirectory = defaultDataDirectory,
  staticDirectory = path.join(projectDirectory, 'dist'),
} = {}) {
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

  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const { pathname } = requestUrl;

      if (pathname.startsWith('/api/')) {
        if (request.method === 'GET' && pathname === '/api/items') {
          sendJson(response, 200, { items: await loadItems() });
          return;
        }

        if (request.method === 'POST' && pathname === '/api/items') {
          const { data, errors } = validateItem(await readBody(request));
          if (Object.keys(errors).length) {
            sendJson(response, 400, { message: 'Please correct the highlighted fields.', errors });
            return;
          }
          const items = await loadItems();
          const item = { id: Date.now(), ...data, date: 'Just now' };
          await writeJson(itemsFile, [item, ...items]);
          sendJson(response, 201, { message: 'Item report submitted successfully.', item });
          return;
        }

        if (request.method === 'POST' && pathname === '/api/claims') {
          const { data, errors } = validateClaim(await readBody(request));
          if (Object.keys(errors).length) {
            sendJson(response, 400, { message: 'Please correct the highlighted fields.', errors });
            return;
          }
          const claims = (await readJson(claimsFile)) ?? [];
          if (!Array.isArray(claims)) throw new Error('Stored claims must be a JSON array.');
          const claim = { id: Date.now(), ...data, submittedAt: new Date().toISOString() };
          await writeJson(claimsFile, [claim, ...claims]);
          sendJson(response, 201, {
            message: 'Claim request submitted! Campus Security will verify your ownership.',
            claim: { id: claim.id, submittedAt: claim.submittedAt },
          });
          return;
        }

        if (request.method === 'POST' && pathname === '/api/reset') {
          const defaults = await readJson(defaultItemsFile);
          if (!Array.isArray(defaults)) throw new Error('Default campus records are missing or invalid.');
          await writeJson(itemsFile, defaults);
          sendJson(response, 200, { message: 'Campus records reset to the default list.', items: defaults });
          return;
        }

        const deleteMatch = pathname.match(/^\/api\/items\/(\d+)$/);
        if (request.method === 'DELETE' && deleteMatch) {
          const items = await loadItems();
          const id = Number(deleteMatch[1]);
          const updatedItems = items.filter((item) => item.id !== id);
          if (updatedItems.length === items.length) {
            sendJson(response, 404, { message: 'Campus record not found.' });
            return;
          }
          await writeJson(itemsFile, updatedItems);
          sendJson(response, 200, { message: 'Campus record removed successfully.' });
          return;
        }

        sendJson(response, 404, { message: 'API route not found.' });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { message: 'Method not allowed.' });
        return;
      }

      const requestedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      const filePath = path.resolve(staticDirectory, `.${requestedPath}`);
      if (!filePath.startsWith(`${path.resolve(staticDirectory)}${path.sep}`) || !existsSync(filePath)) {
        if (path.extname(requestedPath)) {
          sendJson(response, 404, { message: 'File not found.' });
          return;
        }
        const indexPath = path.join(staticDirectory, 'index.html');
        if (!existsSync(indexPath)) {
          sendJson(response, 503, { message: 'Frontend build not found. Run npm run build first.' });
          return;
        }
        response.writeHead(200, { 'Content-Type': contentTypes['.html'] });
        response.end(await readFile(indexPath));
        return;
      }

      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : await readFile(filePath));
    } catch (error) {
      if (error.statusCode) {
        sendJson(response, error.statusCode, { message: error.message });
        return;
      }
      console.error('Request failed:', error);
      sendJson(response, 500, { message: 'An unexpected server error occurred.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, () => {
    console.log(`CampusTrace server listening on http://localhost:${port}`);
  });
}
