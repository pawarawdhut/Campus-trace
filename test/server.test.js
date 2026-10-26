import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    server = createAppServer({ dataDirectory, adminPassword: 'test-admin-password' });
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

  it('rejects blank form strings for required item fields', async () => {
    const response = await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: '   ',
        title: '   ',
        category: '',
        location: '  ',
        contact: '',
        desc: '   ',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.type);
    assert.ok(body.errors.title);
    assert.ok(body.errors.category);
    assert.ok(body.errors.location);
    assert.ok(body.errors.contact);
    assert.ok(body.errors.desc);
  });

  it('validates and stores ownership claims through POST', async () => {
    const invalidResponse = await fetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 1710000000002, prn: '12', proof: 'no' }),
    });
    const invalidBody = await invalidResponse.json();
    assert.equal(invalidResponse.status, 400);
    assert.ok(invalidBody.errors.prn);
    assert.ok(invalidBody.errors.proof);

    const lostItemResponse = await fetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: 1710000000001,
        prn: '1032210000',
        proof: 'Unique scratch on the left side.',
      }),
    });
    const lostItemBody = await lostItemResponse.json();
    assert.equal(lostItemResponse.status, 400);
    assert.ok(lostItemBody.errors.itemId);

    const validResponse = await fetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: 1710000000002,
        prn: '1032210000',
        proof: 'Unique scratch on the left side.',
      }),
    });
    const validBody = await validResponse.json();
    assert.equal(validResponse.status, 201);
    assert.match(validBody.message, /submitted/);
    assert.equal(validBody.claim.itemId, 1710000000002);
    assert.equal(validBody.claim.itemTitle, 'Honda Bike Keys with Lanyard');
  });

  it('protects claim review behind admin login and lets admins update claim status', async () => {
    const unauthorizedResponse = await fetch(`${baseUrl}/api/admin/claims`);
    assert.equal(unauthorizedResponse.status, 401);
    const unauthorizedItemsResponse = await fetch(`${baseUrl}/api/admin/items`);
    assert.equal(unauthorizedItemsResponse.status, 401);

    const invalidLoginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'incorrect-password' }),
    });
    assert.equal(invalidLoginResponse.status, 401);

    const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-admin-password' }),
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];

    const itemsResponse = await fetch(`${baseUrl}/api/admin/items`, {
      headers: { Cookie: cookie },
    });
    const itemsBody = await itemsResponse.json();
    assert.equal(itemsResponse.status, 200);
    assert.ok(itemsBody.items.some((item) => item.title === 'Lost notebook'));

    const claimsResponse = await fetch(`${baseUrl}/api/admin/claims`, {
      headers: { Cookie: cookie },
    });
    const claimsBody = await claimsResponse.json();
    assert.equal(claimsResponse.status, 200);
    const claim = claimsBody.claims.find((entry) => entry.itemId === 1710000000002);
    assert.equal(claim.status, 'Pending');
    assert.equal(claim.prn, '1032210000');
    assert.equal(claim.proof, 'Unique scratch on the left side.');

    const updateResponse = await fetch(`${baseUrl}/api/admin/claims/${claim.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'Approved' }),
    });
    const updateBody = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.claim.status, 'Approved');
    assert.ok(updateBody.claim.reviewedAt);

    const publicItemsResponse = await fetch(`${baseUrl}/api/items`);
    const publicItemsBody = await publicItemsResponse.json();
    const completedItem = publicItemsBody.items.find((item) => item.id === 1710000000002);
    assert.equal(completedItem.status, 'Complete');
    assert.equal(publicItemsResponse.headers.get('cache-control'), 'no-store');

    const invalidUpdateResponse = await fetch(`${baseUrl}/api/admin/claims/${claim.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'Complete' }),
    });
    assert.equal(invalidUpdateResponse.status, 400);

    const rejectedUpdateResponse = await fetch(`${baseUrl}/api/admin/claims/${claim.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'Rejected' }),
    });
    assert.equal(rejectedUpdateResponse.status, 200);
    const reopenedItemsBody = await (await fetch(`${baseUrl}/api/items`)).json();
    assert.equal(
      reopenedItemsBody.items.find((item) => item.id === 1710000000002).status,
      undefined,
    );

    const logoutResponse = await fetch(`${baseUrl}/api/admin/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.equal(logoutResponse.status, 200);
    const loggedOutResponse = await fetch(`${baseUrl}/api/admin/claims`, {
      headers: { Cookie: cookie },
    });
    assert.equal(loggedOutResponse.status, 401);
    const loggedOutItemsResponse = await fetch(`${baseUrl}/api/admin/items`, {
      headers: { Cookie: cookie },
    });
    assert.equal(loggedOutItemsResponse.status, 401);

    await writeFile(path.join(dataDirectory, 'claims.json'), '');
    const secondLoginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-admin-password' }),
    });
    const secondCookie = secondLoginResponse.headers.get('set-cookie').split(';')[0];
    const emptyClaimsResponse = await fetch(`${baseUrl}/api/admin/claims`, {
      headers: { Cookie: secondCookie },
    });
    assert.deepEqual((await emptyClaimsResponse.json()).claims, []);
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

    const adminResponse = await fetch(`${baseUrl}/admin`);
    assert.equal(adminResponse.status, 200);
    assert.match(await adminResponse.text(), /id="root"/);
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
