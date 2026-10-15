// Run with: npm test   (uses Node's built-in test runner, no extra packages)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A tiny stand-in for the C++ program so the tests need no compiler.
// It prints its arguments back as JSON, which lets us check what Node sends.
// It is a Node script, so it runs the same on Windows and Linux.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parking-test-'));
const stub = path.join(tmp, 'fake_backend.js');
fs.writeFileSync(
    stub,
    "console.log(JSON.stringify({ success: true, args: process.argv.slice(2) }));\n"
);
process.env.PARKING_BIN = stub;
process.env.DATA_DIR = tmp;

const app = require('../server.js');
let server, base;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            base = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

after(() => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
});

const post = (url, body) =>
    fetch(base + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

test('1. GET /api/health reports the server is running', async () => {
    const res = await fetch(base + '/api/health');
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
});

test('2. POST /api/park rejects missing fields with 400', async () => {
    const res = await post('/api/park', { plate: 'MH12AB1234' });
    assert.strictEqual(res.status, 400);
});

test('3. POST /api/checkout rejects missing slot with 400', async () => {
    const res = await post('/api/checkout', {});
    assert.strictEqual(res.status, 400);
});

test('4. POST /api/login rejects missing credentials with 400', async () => {
    const res = await post('/api/login', { username: 'admin' });
    assert.strictEqual(res.status, 400);
});

test('5. POST /api/feedback rejects missing message with 400', async () => {
    const res = await post('/api/feedback', { rating: 5 });
    assert.strictEqual(res.status, 400);
});

test('6. GET /api/status returns the JSON produced by the backend', async () => {
    const res = await fetch(base + '/api/status');
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(data.args, ['status']);
});

test('7. POST /api/park passes plate, owner, type and reserved flag in order', async () => {
    const res = await post('/api/park', {
        plate: 'MH12AB1234', owner: 'Test', type: 'Car', reserved: true,
    });
    const data = await res.json();
    assert.deepStrictEqual(data.args, ['park', 'MH12AB1234', 'Test', 'Car', '1']);
});

test('8. Frontend is served, but server source files are not exposed', async () => {
    const home = await fetch(base + '/');
    assert.strictEqual(home.status, 200);
    const src = await fetch(base + '/server.js');
    assert.notStrictEqual(src.status, 200);
    const data = await fetch(base + '/parking_data.txt');
    assert.notStrictEqual(data.status, 200);
});
