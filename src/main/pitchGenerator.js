// src/main/pitchGenerator.js
//
// Turns a scraped lead (+ optional audit result) into a ready-to-send
// WhatsApp/cold-email pitch using Google AI Studio's free-tier Gemini API.
// No SDK dependency — this is a single REST call via the built-in `fetch`
// Node/Electron already ships, kept intentionally tiny so it's obvious
// exactly what leaves the machine and where the API key goes.
import { GEMINI_MODEL, GEMINI_API_BASE } from './constants'

function buildPrompt(lead, audit) {
  const reviewLine =
    lead.reviewCount > 0 && lead.rating
      ? `They have ${lead.reviewCount} Google reviews averaging ${lead.rating}★.`
      : `They don't have many Google reviews yet.`

  let websiteLine
  if (!lead.hasWebsite) {
    websiteLine = `They have no website at all yet.`
  } else if (audit && audit.issues?.length) {
    websiteLine = `Their website has these problems: ${audit.issues.join('; ')}.`
  } else {
    websiteLine = `They have a website (no audit run yet).`
  }

  return [
    `You are writing a short, professional, non-spammy cold outreach message for a web design/marketing freelancer or agency.`,
    `Target business: "${lead.name}" (${lead.category || 'local business'}) in ${lead.address || 'their city'}.`,
    reviewLine,
    websiteLine,
    `Write exactly 3 sentences for a WhatsApp message: (1) a genuine, specific compliment or observation about them, (2) the one biggest problem/opportunity and why it costs them customers, (3) a soft, low-pressure call to action to chat.`,
    `Do not use emojis. Do not sound like a template. Do not exaggerate. Output only the message text, nothing else.`
  ].join('\n')
}

/**
 * Calls Gemini's free-tier generateContent endpoint with the lead's scraped
 * data (and audit results, if available) and returns a ready-to-send pitch.
 * Throws a plain Error with a user-facing message on any failure so the IPC
 * handler can surface it directly in the UI.
 */
export async function generatePitch(lead, audit, apiKey) {
  if (!apiKey) {
    throw new Error('No Gemini API key set. Add a free key from Google AI Studio in Settings.')
  }
  if (!lead || !lead.name) {
    throw new Error('Missing lead data for pitch generation.')
  }

  const prompt = buildPrompt(lead, audit)
  const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      })
    })
  } catch {
    throw new Error('Could not reach the Gemini API. Check your internet connection.')
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new Error('Gemini rejected the request — double-check the API key in Settings.')
    }
    if (response.status === 429) {
      throw new Error('Gemini free-tier rate limit hit — wait a moment and try again.')
    }
    throw new Error(`Gemini API error (HTTP ${response.status}).`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''

  if (!text.trim()) {
    throw new Error('Gemini returned an empty response. Try again.')
  }

  return text.trim()
}
