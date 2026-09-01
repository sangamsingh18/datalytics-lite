// Yeh ai.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Generic LLM completion service.
 *
 * Pattern ported from the ApnaCoach project's server/services/groq.service.js
 * (askAi helper, JSON extraction, rate-limit retry) and adapted to CommonJS
 * + node-fetch (already a dependency here) instead of axios/ESM.
 *
 * Provider resolution:
 *   1. Groq   (if GROQ_API_KEY is set)      — matches the ApnaCoach reference
 *   2. OpenAI (if OPEN_AI_KEY/OPENAI_API_KEY is set) — matches this project's .env
 * If neither key is configured, askAi() throws and callers fall back to
 * static content so the UI never hard-crashes.
 */
const fetch = require('node-fetch');
const env = require('../config/environment');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function resolveProvider() {
  if (env.groqApiKey) {
    return { name: 'groq', url: GROQ_URL, apiKey: env.groqApiKey, model: env.groqModel };
  }
  if (env.openaiApiKey) {
    return { name: 'openai', url: OPENAI_URL, apiKey: env.openaiApiKey, model: env.openaiModel };
  }
  return null;
}

function buildRequestPayload(provider, messages, options = {}) {
  const payload = {
    model: options.model || provider.model,
    messages,
    temperature: options.temperature ?? 0.7,
  };

  if (options.json) {
    payload.response_format = { type: 'json_object' };
  }

  if (typeof options.max_tokens === 'number') {
    const modelName = String(payload.model || '').toLowerCase();
    if (modelName.includes('gpt-5') || modelName.includes('o1') || modelName.includes('o3') || modelName.includes('o4')) {
      payload.max_completion_tokens = options.max_tokens;
    } else {
      payload.max_tokens = options.max_tokens;
    }
  }

  return payload;
}

/**
 * Extracts JSON from a string that may contain markdown fences or extra prose.
 */
function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch (e2) {
        // fall through
      }
    }
    const startBrace = text.indexOf('{');
    const startBracket = text.indexOf('[');
    const start = startBrace !== -1 && (startBracket === -1 || startBrace < startBracket) ? startBrace : startBracket;
    if (start !== -1) {
      const endBrace = text.lastIndexOf('}');
      const endBracket = text.lastIndexOf(']');
      const end = endBrace !== -1 && (endBracket === -1 || endBrace > endBracket) ? endBrace : endBracket;
      if (end !== -1 && end > start) {
        return JSON.parse(text.substring(start, end + 1));
      }
    }
    throw new Error('Could not extract valid JSON from response');
  }
}

/**
 * Calls the configured LLM provider with a chat-style messages array and
 * returns the raw text content. Retries once on HTTP 429.
 */
async function askAi(messages, options = {}, retries = 2) {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error('No AI provider configured (set GROQ_API_KEY or OPEN_AI_KEY in server/.env)');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array is empty');
  }

  const payload = buildRequestPayload(provider, messages, options);

  let response;
  try {
    response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: options.timeoutMs || 60_000,
    });
  } catch (networkErr) {
    throw new Error(`${provider.name} request failed: ${networkErr.message}`);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    if (response.status === 429 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return askAi(messages, options, retries - 1);
    }
    throw new Error(`${provider.name} error (${response.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error(`${provider.name} returned an empty response`);
  }

  if (options.json) {
    return extractJson(content);
  }
  return content;
}

module.exports = { askAi, extractJson, resolveProvider, buildRequestPayload };
