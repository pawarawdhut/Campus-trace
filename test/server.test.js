import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAppServer } from '../server/index.js';

describe('CampusTrace HTTP routes', () => {
  let server;
  let baseUrl;
  let dataDirectory;

  before(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'campus-trace-'));
    server = createAppServer({ dataDirectory });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('returns the seeded item list through GET', async () => {
    const response = await fetch(`${baseUrl}/api/items`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.items.length, 5);
    assert.equal(body.items[0].title, 'MacBook Air M2 (Space Gray)');
  });

  it('rejects invalid reports on the server and accepts valid reports', async () => {
    const invalidResponse = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Missing', title: 'x', contact: '123' }),
    });
    const invalidBody = await invalidResponse.json();

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidBody.errors.type, 'Select Lost or Found.');
    assert.ok(invalidBody.errors.contact);
    assert.ok(invalidBody.errors.category);

    const validResponse = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'Lost',
        title: 'Lost notebook',
        category: 'Stationery',
        location: 'Central Library',
        contact: '9876543210',
        desc: 'Blue notebook with a name on the cover.',
        ignored: 'not persisted',
      }),
    });
    const validBody = await validResponse.json();

    assert.equal(validResponse.status, 201);
    assert.equal(validBody.item.title, 'Lost notebook');
    assert.equal('ignored' in validBody.item, false);

    const listResponse = await fetch(`${baseUrl}/api/items`);
    assert.equal((await listResponse.json()).items.length, 6);
  });

  it('validates and stores ownership claims through POST', async () => {
    const invalidResponse = await fetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prn: '12', proof: 'no' }),
    });
    const invalidBody = await invalidResponse.json();
    assert.equal(invalidResponse.status, 400);
    assert.ok(invalidBody.errors.prn);
    assert.ok(invalidBody.errors.proof);

    const validResponse = await fetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prn: '1032210000', proof: 'Unique scratch on the left side.' }),
    });
    const validBody = await validResponse.json();
    assert.equal(validResponse.status, 201);
    assert.match(validBody.message, /submitted/);
  });

  it('deletes records and restores seeded records via POST reset', async () => {
    const deleteResponse = await fetch(`${baseUrl}/api/items/1710000000001`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await (await fetch(`${baseUrl}/api/items`)).json()).items.length, 5);

    const resetResponse = await fetch(`${baseUrl}/api/reset`, { method: 'POST' });
    const resetBody = await resetResponse.json();
    assert.equal(resetResponse.status, 200);
    assert.equal(resetBody.items.length, 5);
  });

  it('serves the built frontend through Express', async () => {
    const response = await fetch(baseUrl);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /id="root"/);
  });

  it('returns helpful errors for malformed JSON, oversized bodies, and unknown routes', async () => {
    const malformedResponse = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformedResponse.status, 400);

    const oversizedResponse = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'x'.repeat(17 * 1024) }),
    });
    assert.equal(oversizedResponse.status, 413);

    const missingResponse = await fetch(`${baseUrl}/api/missing`);
    assert.equal(missingResponse.status, 404);

    const unsupportedResponse = await fetch(`${baseUrl}/api/items`, { method: 'PUT' });
    assert.equal(unsupportedResponse.status, 404);
  });
});
