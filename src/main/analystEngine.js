// src/main/analystEngine.js
//
// Turns the raw JSON that scraper.js/businessProfiler.js/auditEngine.js
// produce into an actual sales-ready analysis: a digital maturity score,
// KPIs, a SWOT, a prioritized vulnerability list, and one outreach angle —
// via Gemini (primary, using the official SDK) with an OpenRouter/DeepSeek
// R1 fallback when Gemini rate-limits or errors out.
//
// Design notes:
//   - The model is asked for strict JSON and we still don't trust it: every
//     response goes through sanitizeAndParseJson() (strip markdown fences,
//     parse) and then validateAnalysis() (schema + the "every weakness maps
//     to a real Dopmin service" business rule) before we accept it. A
//     failure on either step re-prompts with the specific error, up to
//     ANALYST_MAX_JSON_RETRIES times.
//   - Results are cached locally (db.js, SQLite or its JSON fallback) keyed
//     by the business URL, so re-opening the same lead doesn't re-spend
//     API quota — see ANALYST_CACHE_TTL_MS in constants.js for the staleness
//     window.
// Note: load the Gemini SDK dynamically so missing or optional SDK installs
// do not crash the app during startup.
import {
  GEMINI_MODEL,
  OPENROUTER_API_BASE,
  OPENROUTER_MODEL,
  ANALYST_MAX_JSON_RETRIES,
  ANALYST_CACHE_TTL_MS,
  DOPMIN_SERVICES
} from './constants'
import { getCachedAnalysis, setCachedAnalysis } from './db'

function normalizeCacheKey(urlOrHostname) {
  return (urlOrHostname || '').trim().toLowerCase().replace(/\/+$/, '')
}

// 2.3 — Master prompt template: role, input, strict output schema, and the
// business rule tying every weakness to something Dopmin actually sells.
function buildAnalystPrompt(scrapedData) {
  const schema = `{
  "digitalMaturityScore": <integer 0-100>,
  "kpis": [ { "label": <string>, "value": <string>, "insight": <string> } ],
  "swot": {
    "strengths": [ <string> ],
    "weaknesses": [ <string> ],
    "opportunities": [ <string> ],
    "threats": [ <string> ]
  },
  "vulnerabilities": [
    { "issue": <string>, "impact": <string>, "dopminService": <one of the service names listed below, verbatim> }
  ],
  "outreachAngle": <string, 2-3 sentences, the single best opening line for a cold pitch>
}`

  return [
    `You are a Senior Digital Strategist at Dopmin, a web design & digital marketing agency that finds and pitches local businesses with weak online presences.`,
    ``,
    `You will be given scraped/audited data about ONE business's website (or lack of one). Analyze it and return ONLY a single strict JSON object — no markdown code fences, no commentary before or after — matching exactly this shape:`,
    schema,
    ``,
    `Rules:`,
    `- digitalMaturityScore is your own judgment (0 = no web presence at all, 100 = excellent) based on the signals given.`,
    `- kpis should be the 3-6 most sales-relevant data points from the input (e.g. load time, mobile-responsiveness, review rating, SSL, analytics presence) — not just an echo of every field.`,
    `- Every single entry in "vulnerabilities" MUST have a "dopminService" value copied EXACTLY (character for character) from this list — do not invent services, do not paraphrase them:`,
    DOPMIN_SERVICES.map((s) => `  - ${s}`).join('\n'),
    `- If a weakness doesn't clearly map to one of those services, omit it from "vulnerabilities" rather than forcing a bad match.`,
    `- outreachAngle should read like the opening line of a real WhatsApp/email message, not a marketing slogan.`,
    `- Output nothing except the JSON object.`,
    ``,
    `Business data:`,
    JSON.stringify(scrapedData, null, 2)
  ].join('\n')
}

/** 2.4a — strips ```json fences (or bare ```), then parses. Falls back to
 * extracting the first balanced-looking {...} span if the model wrapped the
 * JSON in extra prose despite instructions not to. */
function sanitizeAndParseJson(rawText) {
  const stripped = (rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return { ok: true, data: JSON.parse(stripped) }
  } catch (firstError) {
    const match = stripped.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return { ok: true, data: JSON.parse(match[0]) }
      } catch (secondError) {
        return { ok: false, error: `Could not parse JSON: ${secondError.message}` }
      }
    }
    return { ok: false, error: `Could not parse JSON: ${firstError.message}` }
  }
}

/** 2.4b — schema validation, including the "every weakness maps to a real
 * Dopmin service" business rule from 2.3. Returns every problem found (not
 * just the first) so the retry prompt can address them all at once. */
function validateAnalysis(data) {
  const errors = []
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Response was not a JSON object.'] }
  }

  const score = data.digitalMaturityScore
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
    errors.push('digitalMaturityScore must be a number between 0 and 100.')
  }

  if (!Array.isArray(data.kpis) || data.kpis.length === 0) {
    errors.push('kpis must be a non-empty array.')
  } else {
    data.kpis.forEach((kpi, i) => {
      if (!kpi || typeof kpi.label !== 'string' || typeof kpi.value !== 'string') {
        errors.push(`kpis[${i}] must have string "label" and "value" fields.`)
      }
    })
  }

  const swot = data.swot
  const swotKeys = ['strengths', 'weaknesses', 'opportunities', 'threats']
  if (!swot || typeof swot !== 'object') {
    errors.push('swot must be an object with strengths/weaknesses/opportunities/threats arrays.')
  } else {
    for (const key of swotKeys) {
      if (!Array.isArray(swot[key])) {
        errors.push(`swot.${key} must be an array of strings.`)
      }
    }
  }

  if (!Array.isArray(data.vulnerabilities)) {
    errors.push('vulnerabilities must be an array.')
  } else {
    data.vulnerabilities.forEach((v, i) => {
      if (!v || typeof v.issue !== 'string' || !v.issue.trim()) {
        errors.push(`vulnerabilities[${i}] is missing a string "issue".`)
      }
      if (!v || typeof v.dopminService !== 'string' || !DOPMIN_SERVICES.includes(v.dopminService)) {
        errors.push(
          `vulnerabilities[${i}].dopminService must be exactly one of: ${DOPMIN_SERVICES.join(', ')}.`
        )
      }
    })
  }

  if (typeof data.outreachAngle !== 'string' || !data.outreachAngle.trim()) {
    errors.push('outreachAngle must be a non-empty string.')
  }

  return { valid: errors.length === 0, errors }
}

/** 2.2 — Gemini via the official SDK, asked for JSON output directly. */
async function callGemini(prompt, apiKey) {
  if (!apiKey) {
    const err = new Error('No Gemini API key configured.')
    err.provider = 'gemini'
    err.configMissing = true
    throw err
  }

  let GoogleGenerativeAI
  try {
    const mod = await import('@google/generative-ai')
    GoogleGenerativeAI = mod.GoogleGenerativeAI || mod.default
  } catch (loadErr) {
    const err = new Error('Gemini SDK (@google/generative-ai) not installed or failed to load.')
    err.provider = 'gemini'
    err.sdkMissing = true
    throw err
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
    })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    if (!text || !text.trim()) throw new Error('Gemini returned an empty response.')
    return { text, source: 'gemini' }
  } catch (error) {
    const message = error?.message || String(error)
    const wrapped = new Error(message)
    wrapped.provider = 'gemini'
    wrapped.isRateLimit = /429|rate.?limit|resource_exhausted|quota/i.test(message)
    throw wrapped
  }
}

/** 2.5 — OpenRouter free-tier fallback (DeepSeek R1 by default). Plain
 * `fetch`, matching the no-SDK style already used by pitchGenerator.js —
 * OpenRouter has no first-party SDK worth adding a dependency for. */
async function callOpenRouter(prompt, apiKey) {
  if (!apiKey) {
    const err = new Error('No OpenRouter API key configured.')
    err.provider = 'openrouter'
    err.configMissing = true
    throw err
  }

  let response
  try {
    response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      })
    })
  } catch {
    const err = new Error('Could not reach OpenRouter. Check your internet connection.')
    err.provider = 'openrouter'
    throw err
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const err = new Error(`OpenRouter API error (HTTP ${response.status}): ${body.slice(0, 200)}`)
    err.provider = 'openrouter'
    err.isRateLimit = response.status === 429
    throw err
  }

  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content || ''
  if (!text.trim()) {
    const err = new Error('OpenRouter returned an empty response.')
    err.provider = 'openrouter'
    throw err
  }
  return { text, source: 'openrouter' }
}

/** Tries Gemini first (if a key is configured), falls back to OpenRouter on
 * a rate-limit/error/missing-key, and only throws once neither option is
 * available or both failed. */
async function requestFromLLM(prompt, keys, onProgress) {
  const { geminiApiKey, openRouterApiKey } = keys
  let geminiError = null

  if (geminiApiKey) {
    try {
      onProgress?.({ phase: 'analyzing', message: 'Asking Gemini…' })
      return await callGemini(prompt, geminiApiKey)
    } catch (error) {
      geminiError = error
      if (!openRouterApiKey) throw error
      onProgress?.({
        phase: 'analyzing',
        message: `Gemini unavailable (${error.isRateLimit ? 'rate limited' : 'error'}) — falling back to OpenRouter…`
      })
    }
  }

  if (openRouterApiKey) {
    try {
      return await callOpenRouter(prompt, openRouterApiKey)
    } catch (error) {
      if (geminiError) {
        throw new Error(
          `Gemini failed (${geminiError.message}); OpenRouter fallback also failed (${error.message}).`
        )
      }
      throw error
    }
  }

  throw new Error('No Gemini or OpenRouter API key configured. Add one in Settings.')
}

/**
 * Runs the full analysis pipeline for one business's scraped data:
 * cache check → prompt → LLM (with fallback) → sanitize/validate JSON
 * (retrying on failure) → cache write.
 *
 * @param {object} scrapedData - output of businessProfiler.js/auditEngine.js
 * @param {{ geminiApiKey?: string, openRouterApiKey?: string }} keys
 * @param {(payload: object) => void} [onProgress]
 * @param {boolean} [forceRefresh] - bypass the cache and re-call the LLM
 */
export async function analyzeBusinessProfile(
  scrapedData,
  keys = {},
  onProgress,
  forceRefresh = false
) {
  const identity = scrapedData?.url || scrapedData?.hostname
  if (!scrapedData || !identity) {
    return { success: false, error: 'Missing scraped business data to analyze.' }
  }

  const cacheKey = normalizeCacheKey(identity)

  // 2.6 — serve from cache unless it's stale or the caller asked to skip it.
  if (!forceRefresh) {
    const cached = getCachedAnalysis(cacheKey)
    if (cached && Date.now() - new Date(cached.cachedAt).getTime() < ANALYST_CACHE_TTL_MS) {
      onProgress?.({ phase: 'done', message: 'Loaded from cache.' })
      return { success: true, fromCache: true, analysis: cached.analysis, source: cached.source }
    }
  }

  const basePrompt = buildAnalystPrompt(scrapedData)
  let correction = ''
  let lastErrors = []

  for (let attempt = 0; attempt <= ANALYST_MAX_JSON_RETRIES; attempt += 1) {
    const prompt = correction
      ? `${basePrompt}\n\nYour previous response was rejected for these reasons: ${correction}\nReturn ONLY the corrected JSON object — no markdown fences, no commentary.`
      : basePrompt

    let llmResult
    try {
      llmResult = await requestFromLLM(prompt, keys, onProgress)
    } catch (error) {
      return { success: false, error: error.message }
    }

    const parsed = sanitizeAndParseJson(llmResult.text)
    if (!parsed.ok) {
      lastErrors = [parsed.error]
      correction = parsed.error
      continue
    }

    const { valid, errors } = validateAnalysis(parsed.data)
    if (!valid) {
      lastErrors = errors
      correction = errors.join(' ')
      continue
    }

    setCachedAnalysis(cacheKey, { analysis: parsed.data, source: llmResult.source })
    onProgress?.({ phase: 'done' })
    return { success: true, fromCache: false, analysis: parsed.data, source: llmResult.source }
  }

  return {
    success: false,
    error: `LLM returned invalid JSON after ${ANALYST_MAX_JSON_RETRIES + 1} attempts: ${lastErrors.join('; ')}`
  }
}
