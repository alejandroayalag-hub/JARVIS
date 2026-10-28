// Cliente mínimo de Ollama. Único destino de red permitido para datos de la casa.
export async function ollamaChat({ model, messages, format }, {
  url = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434', timeoutMs = 60000, fetchImpl = fetch,
} = {}) {
  const res = await fetchImpl(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, format, stream: false, keep_alive: '5m', think: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  return (await res.json()).message.content;
}
