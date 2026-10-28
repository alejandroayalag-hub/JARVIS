import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readReceipt, PROMPT_COMPROBANTE } from '../src/comprobante.js';
import { ollamaChat } from '../src/ollama.js';

const fake = (out) => async () => { if (out instanceof Error) throw out; return out; };
const img = Buffer.from('jpg');

test('lee montos en número o texto con comas', async () => {
  assert.deepEqual(await readReceipt(img, { chat: fake('{"monto":4500}') }), { cents: 450000 });
  assert.deepEqual(await readReceipt(img, { chat: fake('{"monto":"4,500.50"}') }), { cents: 450050 });
  assert.deepEqual(await readReceipt(img, { chat: fake('{"monto":"$1,234.5"}') }), { cents: 123450 });
});

test('ilegible, Ollama caído, basura o monto <= 0 dan null', async () => {
  for (const out of ['{"monto":null}', new Error('ECONNREFUSED'), 'basura', '{"monto":0}', '{"monto":-5}', '{}']) {
    assert.deepEqual(await readReceipt(img, { chat: fake(out) }), { cents: null });
  }
});

test('manda la imagen en base64 con el prompt y el modelo', async () => {
  let got;
  await readReceipt(img, { model: 'm', chat: async (req) => { got = req; return '{"monto":1}'; } });
  assert.equal(got.model, 'm');
  assert.equal(got.messages[0].content, PROMPT_COMPROBANTE);
  assert.deepEqual(got.messages[0].images, [img.toString('base64')]);
  assert.ok(got.format);
});

test('ollamaChat devuelve el contenido y lanza en error HTTP', async () => {
  const ok = async (url, init) => {
    assert.match(url, /\/api\/chat$/);
    const b = JSON.parse(init.body);
    assert.equal(b.stream, false);
    assert.equal(b.keep_alive, '5m');
    return new Response(JSON.stringify({ message: { content: 'hola' } }));
  };
  assert.equal(await ollamaChat({ model: 'x', messages: [] }, { fetchImpl: ok }), 'hola');
  const bad = async () => new Response('model not found', { status: 404 });
  await assert.rejects(ollamaChat({ model: 'x', messages: [] }, { fetchImpl: bad }));
});
