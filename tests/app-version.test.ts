// ==============================================================================
// TEST: tests/app-version.test.ts
// Unit test endpoint GET & OPTIONS /api/app-version (In-App Auto Updater)
// ==============================================================================

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { GET, OPTIONS } from '../src/app/api/app-version/route.ts';

describe('In-App Auto Updater API Route (/api/app-version)', () => {

  test('OPTIONS mengembalikan response 200 dengan header CORS lengkap', async () => {
    const res = await OPTIONS();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(res.headers.get('Access-Control-Allow-Methods') || '', /GET/);
  });

  test('GET mengembalikan informasi versi APK yang valid dan struktur lengkap', async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');

    const data = await res.json();
    assert.ok(typeof data.versionCode === 'number', 'versionCode harus berupa angka');
    assert.ok(data.versionCode >= 1, 'versionCode minimal bernilai 1');
    assert.ok(typeof data.versionName === 'string', 'versionName harus berupa string');
    assert.ok(data.apkUrl && data.apkUrl.includes('.apk'), 'apkUrl harus mengarah ke file APK');
    assert.ok(typeof data.releaseNotes === 'string' && data.releaseNotes.length > 0, 'releaseNotes harus terisi');
  });

});
