import { GoogleAuth } from 'google-auth-library';
import { vertexConfig } from './config.js';
import { state } from './state.js';

const adcAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

function vertexProvider() {
  if (vertexConfig.forceFallback) return 'local-fallback';
  if (vertexConfig.apiKey) return 'vertex-express';
  if (vertexConfig.projectId) return 'vertex-adc';
  return 'local-fallback';
}

export function aiStatus() {
  const provider = vertexProvider();
  const verified = provider !== 'local-fallback' && Boolean(state.ai.lastOkAt);
  const configured = {
    forceFallback: vertexConfig.forceFallback,
    expressApiKey: Boolean(vertexConfig.apiKey),
    applicationDefaultCredentials: Boolean(vertexConfig.projectId),
  };
  return {
    ready: verified,
    provider,
    configured,
    credentialsMode: provider === 'vertex-express' ? 'api-key' : provider === 'vertex-adc' ? 'adc' : 'none',
    textModel: vertexConfig.textModel,
    imageModel: vertexConfig.imageModel,
    projectId: vertexConfig.projectId || null,
    location: vertexConfig.location || null,
    message: verified
      ? (provider === 'vertex-express' ? 'AI ready via Vertex Express' : 'AI ready via Vertex ADC')
      : provider === 'vertex-express'
        ? 'Vertex Express configured; smoke test required'
        : provider === 'vertex-adc'
          ? 'Vertex ADC configured; smoke test required'
          : 'Local fallback active',
    lastError: state.ai.lastError,
    lastOkAt: state.ai.lastOkAt,
    lastProvider: state.ai.lastProvider,
    lastLatencyMs: state.ai.lastLatencyMs,
    lastSmokeTestAt: state.ai.lastSmokeTestAt,
    smokeTestRecommended: provider !== 'local-fallback' && !state.ai.lastOkAt,
  };
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const objectFirst = trimmed.indexOf('{');
    const objectLast = trimmed.lastIndexOf('}');
    const arrayFirst = trimmed.indexOf('[');
    const arrayLast = trimmed.lastIndexOf(']');
    const first = objectFirst >= 0 && (arrayFirst < 0 || objectFirst < arrayFirst) ? objectFirst : arrayFirst;
    const last = first === objectFirst ? objectLast : arrayLast;
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

function requestBody(prompt) {
  return {
    contents: [{
      role: 'user',
      parts: [{
        text: [
          'Return strict JSON only. Do not include markdown fences, commentary, or trailing prose.',
          prompt,
        ].join('\n\n'),
      }],
    }],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: 'application/json',
    },
  };
}

function expressEndpoint(model) {
  return `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(vertexConfig.apiKey)}`;
}

function adcEndpoint(model) {
  const location = encodeURIComponent(vertexConfig.location);
  const projectId = encodeURIComponent(vertexConfig.projectId);
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

async function vertexHeaders(provider) {
  if (provider === 'vertex-express') {
    return { 'content-type': 'application/json' };
  }

  const token = await adcAuth.getAccessToken();
  if (!token) {
    throw new Error('Application Default Credentials did not return an access token. Run `gcloud auth application-default login`.');
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };
}

function withTimeout(promise, timeoutMs, message, onTimeout = () => {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function unverifiedVertexMessage() {
  return 'Vertex is configured but has not passed a smoke test in this server session. Run POST /api/ai/smoke-test to verify credentials before live AI calls.';
}

export async function callVertexJson({ prompt, model = vertexConfig.textModel, allowUnverified = false }) {
  const provider = vertexProvider();
  if (provider === 'local-fallback') {
    state.ai.lastProvider = 'local-fallback';
    return {
      ok: false,
      generatedBy: 'local-fallback',
      error: 'Configure VERTEX_AI_API_KEY for Express Mode, or VERTEX_AI_PROJECT with Application Default Credentials.',
    };
  }

  if (!allowUnverified && !state.ai.lastOkAt) {
    state.ai.lastProvider = 'local-fallback';
    state.ai.lastError = unverifiedVertexMessage();
    return {
      ok: false,
      generatedBy: 'local-fallback',
      error: unverifiedVertexMessage(),
    };
  }

  const endpoint = provider === 'vertex-express' ? expressEndpoint(model) : adcEndpoint(model);
  const body = requestBody(prompt);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    try {
      const headers = await withTimeout(
        vertexHeaders(provider),
        vertexConfig.timeoutMs,
        `Vertex authentication timed out after ${vertexConfig.timeoutMs}ms.`,
      );
      const response = await withTimeout(fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      }), vertexConfig.timeoutMs, `Vertex request timed out after ${vertexConfig.timeoutMs}ms.`, () => controller.abort());
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || `Vertex request failed with ${response.status}`);
      }
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
      const data = extractJson(text);
      if (!data) throw new Error('Vertex response did not contain valid JSON.');
      state.ai.lastError = null;
      state.ai.lastOkAt = new Date().toISOString();
      state.ai.lastProvider = provider;
      state.ai.lastLatencyMs = Date.now() - started;
      return { ok: true, data, generatedBy: provider };
    } catch (error) {
      state.ai.lastError = error.message;
      state.ai.lastProvider = provider;
      state.ai.lastLatencyMs = Date.now() - started;
      if (attempt === 1) {
        return { ok: false, generatedBy: 'local-fallback', error: error.message };
      }
    }
  }

  return { ok: false, generatedBy: 'local-fallback', error: 'Vertex request failed.' };
}

export async function smokeTestVertex() {
  state.ai.lastSmokeTestAt = new Date().toISOString();
  const result = await callVertexJson({
    prompt: 'Return JSON exactly matching this shape: { "ok": true, "service": "vertex", "checks": ["json"] }.',
    allowUnverified: true,
  });
  return {
    ...aiStatus(),
    smokeTest: {
      ok: result.ok && result.data?.ok === true,
      generatedBy: result.generatedBy,
      data: result.ok ? result.data : null,
      error: result.ok ? null : result.error,
    },
  };
}
