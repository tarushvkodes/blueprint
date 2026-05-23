function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function createAiModule({ vertexConfig, aiState }) {
  function aiStatus() {
    return {
      ready: Boolean(vertexConfig.apiKey),
      provider: vertexConfig.apiKey ? 'vertex-express' : 'local-fallback',
      textModel: vertexConfig.textModel,
      imageModel: vertexConfig.imageModel,
      message: vertexConfig.apiKey ? 'AI ready' : 'Local fallback active',
      lastError: aiState.lastError,
    };
  }

  async function callVertexJson({ prompt, model = vertexConfig.textModel }) {
    if (!vertexConfig.apiKey) {
      return { ok: false, generatedBy: 'local-fallback', error: 'VERTEX_AI_API_KEY is not configured.' };
    }

    const endpoint = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(vertexConfig.apiKey)}`;
    const body = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
      },
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error?.message || `Vertex request failed with ${response.status}`);
        }
        const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
        const data = extractJson(text);
        if (!data) throw new Error('Vertex response did not contain valid JSON.');
        aiState.lastError = null;
        return { ok: true, data, generatedBy: 'vertex-express' };
      } catch (error) {
        aiState.lastError = error.message;
        if (attempt === 1) {
          return { ok: false, generatedBy: 'local-fallback', error: error.message };
        }
      }
    }

    return { ok: false, generatedBy: 'local-fallback', error: 'Vertex request failed.' };
  }

  return {
    aiStatus,
    callVertexJson,
  };
}
