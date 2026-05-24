import { googleAiStudioConfig } from './config.js';
import { state } from './state.js';

function googleAiStudioProvider() {
  if (googleAiStudioConfig.forceFallback) return 'local-fallback';
  if (googleAiStudioConfig.apiKey) return 'google-ai-studio';
  return 'local-fallback';
}

export function aiStatus() {
  const provider = googleAiStudioProvider();
  const verified = provider !== 'local-fallback' && Boolean(state.ai.lastOkAt);
  const configured = {
    forceFallback: googleAiStudioConfig.forceFallback,
    aiStudioApiKey: Boolean(googleAiStudioConfig.apiKey),
  };
  return {
    ready: verified,
    provider,
    configured,
    credentialsMode: provider === 'google-ai-studio' ? 'api-key' : 'none',
    textModel: googleAiStudioConfig.textModel,
    imageModel: googleAiStudioConfig.imageModel,
    projectId: null,
    location: null,
    message: verified
      ? 'AI ready via Google AI Studio'
      : provider === 'google-ai-studio'
        ? 'Google AI Studio configured; smoke test required'
        : 'Local fallback active',
    lastError: state.ai.lastError,
    lastOkAt: state.ai.lastOkAt,
    lastProvider: state.ai.lastProvider,
    lastLatencyMs: state.ai.lastLatencyMs,
    lastSmokeTestAt: state.ai.lastSmokeTestAt,
    smokeTestRecommended: provider !== 'local-fallback' && !state.ai.lastOkAt,
  };
}

export function extractGoogleAiJson(text) {
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

function textContent(text) {
  return {
    parts: [{ text }],
  };
}

export function buildGoogleAiStudioRequestBody({
  prompt,
  systemPrompt,
  temperature = 0.35,
  responseSchema = null,
  responseMimeType = 'application/json',
}) {
  const userPrompt = [
    responseMimeType === 'application/json'
      ? 'Return strict JSON only. Do not include markdown fences, commentary, or trailing prose.'
      : '',
    prompt,
  ].filter(Boolean).join('\n\n');

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: userPrompt }],
    }],
    generationConfig: {
      temperature,
    },
  };

  if (responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }

  if (systemPrompt) {
    body.systemInstruction = textContent(systemPrompt);
  }

  if (responseSchema) {
    body.generationConfig.responseSchema = responseSchema;
  }

  return body;
}

function googleAiStudioEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(googleAiStudioConfig.apiKey)}`;
}

function googleAiStudioStreamEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(googleAiStudioConfig.apiKey)}`;
}

function googleAiStudioHeaders() {
  return { 'content-type': 'application/json' };
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

function unverifiedGoogleAiStudioMessage() {
  return 'Google AI Studio is configured but has not passed a smoke test in this server session. Run POST /api/ai/smoke-test to verify credentials before live AI calls.';
}

function responseTextFromPayload(payload) {
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
}

function responseErrorFromPayload(payload, status = null) {
  const candidate = payload.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const finishMessage = candidate?.finishMessage;
  if (payload.error?.message) return payload.error.message;
  if (finishMessage) return finishMessage;
  if (finishReason && finishReason !== 'STOP') return `Google AI Studio stopped generation with finishReason=${finishReason}.`;
  if (status === null) return null;
  return `Google AI Studio request failed with ${status}`;
}

export async function callGoogleAiStudioJson({
  prompt,
  systemPrompt,
  model = googleAiStudioConfig.textModel,
  allowUnverified = false,
  temperature = 0.35,
  responseSchema = null,
}) {
  const provider = googleAiStudioProvider();
  if (provider === 'local-fallback') {
    state.ai.lastProvider = 'local-fallback';
    return {
      ok: false,
      generatedBy: 'local-fallback',
      error: 'Configure GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY with an API key from Google AI Studio.',
    };
  }

  if (!allowUnverified && !state.ai.lastOkAt) {
    state.ai.lastProvider = 'local-fallback';
    state.ai.lastError = unverifiedGoogleAiStudioMessage();
    return {
      ok: false,
      generatedBy: 'local-fallback',
      error: unverifiedGoogleAiStudioMessage(),
    };
  }

  const endpoint = googleAiStudioEndpoint(model);
  const body = buildGoogleAiStudioRequestBody({ prompt, systemPrompt, temperature, responseSchema });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    try {
      const response = await withTimeout(fetch(endpoint, {
        method: 'POST',
        headers: googleAiStudioHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      }), googleAiStudioConfig.timeoutMs, `Google AI Studio request timed out after ${googleAiStudioConfig.timeoutMs}ms.`, () => controller.abort());
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseErrorFromPayload(payload, response.status));
      }
      const text = responseTextFromPayload(payload);
      const data = extractGoogleAiJson(text);
      if (!data) {
        throw new Error(responseErrorFromPayload(payload) || 'Google AI Studio response did not contain valid JSON.');
      }
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

  return { ok: false, generatedBy: 'local-fallback', error: 'Google AI Studio request failed.' };
}

export async function streamGoogleAiStudioText({
  prompt,
  systemPrompt,
  model = googleAiStudioConfig.textModel,
  temperature = 0.4,
  onText,
}) {
  const provider = googleAiStudioProvider();
  if (provider === 'local-fallback') {
    state.ai.lastProvider = 'local-fallback';
    return {
      ok: false,
      generatedBy: 'local-fallback',
      error: 'Configure GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY with an API key from Google AI Studio.',
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const body = buildGoogleAiStudioRequestBody({
    prompt,
    systemPrompt,
    temperature,
    responseMimeType: null,
  });

  try {
    const response = await withTimeout(fetch(googleAiStudioStreamEndpoint(model), {
      method: 'POST',
      headers: googleAiStudioHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    }), googleAiStudioConfig.timeoutMs, `Google AI Studio stream timed out after ${googleAiStudioConfig.timeoutMs}ms.`, () => controller.abort());

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(responseErrorFromPayload(payload, response.status));
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split(/\n\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const data = event.split(/\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s*/, '')).join('\n');
        if (!data || data === '[DONE]') continue;
        const payload = JSON.parse(data);
        const text = responseTextFromPayload(payload);
        if (text) {
          fullText += text;
          onText?.(text);
        }
      }
    }

    state.ai.lastError = null;
    state.ai.lastOkAt = new Date().toISOString();
    state.ai.lastProvider = provider;
    state.ai.lastLatencyMs = Date.now() - started;
    return { ok: true, text: fullText, generatedBy: provider };
  } catch (error) {
    state.ai.lastError = error.message;
    state.ai.lastProvider = provider;
    state.ai.lastLatencyMs = Date.now() - started;
    return { ok: false, generatedBy: 'local-fallback', error: error.message };
  }
}

export async function smokeTestGoogleAiStudio() {
  state.ai.lastSmokeTestAt = new Date().toISOString();
  const result = await callGoogleAiStudioJson({
    systemPrompt: 'You are a JSON-only Google AI Studio connectivity checker.',
    prompt: 'Return JSON exactly matching this shape: { "ok": true, "service": "google-ai-studio", "checks": ["json"] }.',
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
