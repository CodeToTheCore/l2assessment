import { handleLlmRequest } from '../server/llmHandler.js';

/**
 * Vercel serverless function: POST /api/llm
 * GROQ_API_KEY is set in the Vercel project's environment variables, never in the code.
 */

// Simple per-visitor limit so one person can't burn through the Groq quota.
// It lives in memory, so it resets when the function cold-starts. That's fine for a demo.
const LIMIT_PER_HOUR = 30;
const hits = new Map();

function overLimit(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT_PER_HOUR;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (overLimit(ip)) {
    return res.status(429).json({ error: `Limit of ${LIMIT_PER_HOUR} AI requests per hour reached. Try again later.` });
  }
  const { status, body } = await handleLlmRequest(req.body, { apiKey: process.env.GROQ_API_KEY });
  return res.status(status).json(body);
}
