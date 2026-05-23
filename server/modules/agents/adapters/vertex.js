import { validateStructuredOutput } from './validation.js';

export function extractJson(text) {
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

export class VertexAdapter {
  constructor({ apiKey, textModel }) {
    this.name = 'vertex-express';
    this.model = textModel;
    this.apiKey = apiKey;
  }

  endpoint(model = this.model) {
    return `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
  }

  async requestContent(prompt, { model = this.model, responseMimeType = 'text/plain', temperature = 0.35 } = {}) {
    const body = {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature,
        responseMimeType,
      },
    };

    const response = await fetch(this.endpoint(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || `Vertex request failed with ${response.status}`);
    }
    return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
  }

  async generateJson(prompt, schema, options = {}) {
    const text = await this.requestContent(prompt, {
      model: options.model || this.model,
      responseMimeType: 'application/json',
      temperature: options.temperature ?? 0.35,
    });
    const data = extractJson(text);
    if (!data) {
      throw new Error('Vertex response did not contain valid JSON.');
    }
    return validateStructuredOutput({
      adapterName: this.name,
      schemaName: options.schemaName,
      schema,
      data,
    });
  }

  async generateText(prompt, options = {}) {
    return this.requestContent(prompt, {
      model: options.model || this.model,
      responseMimeType: 'text/plain',
      temperature: options.temperature ?? 0.35,
    });
  }
}

