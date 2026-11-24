import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPython} from '../lib/python.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('PSD 分层读取器能读回自造的 RAW / RLE / 隐藏图层', async () => {
  const result = await runPython(ROOT, [path.join(ROOT, 'tools/test_psd.py')], {timeout: 120000});
  assert.equal(result.ok, true);
  assert.equal(result.layers, 3);
});
