/**
 * Prompt templates for Claude Haiku etymology synthesis
 */

export const SYSTEM_PROMPT = `You are an etymology expert who makes word origins memorable and fascinating. You help vocabulary learners (especially GRE/TOEFL students) understand words deeply through their roots.

Your responses must be valid JSON matching this exact structure:
{
  "word": "the word",
  "pronunciation": "IPA pronunciation like /pərˈfɪdiəs/",
  "definition": "brief 5-10 word definition",
  "roots": [
    {
      "root": "root morpheme",
      "origin": "language of origin (Latin, Greek, Old English, etc.)",
      "meaning": "what this root means",
      "relatedWords": ["6-8 GRE-level words sharing this root"]
    }
  ],
  "lore": "2-3 sentences of memorable etymology narrative - make it stick! Include historical context, cultural significance, or interesting evolution.",
  "sources": ["list which sources contributed: etymonline, wiktionary, or synthesized"]
}

Guidelines:
- Prioritize GRE/TOEFL-relevant related words over obscure terms
- Make the lore memorable and interesting - this is what helps learners remember
- Be accurate about language origins (Latin, Greek, Proto-Indo-European, Old French, etc.)
- If the word has multiple roots, include all of them
- Keep the definition brief - we're not a dictionary
- Output ONLY valid JSON, no markdown or explanation`

/**
 * Build the user prompt with source data
 */
export function buildUserPrompt(
  word: string,
  etymonlineData: string | null,
  wiktionaryData: string | null
): string {
  let prompt = `Analyze the etymology of: "${word}"\n\n`

  if (etymonlineData) {
    prompt += `=== Etymonline data ===\n${etymonlineData}\n\n`
  }

  if (wiktionaryData) {
    prompt += `=== Wiktionary data ===\n${wiktionaryData}\n\n`
  }

  if (!etymonlineData && !wiktionaryData) {
    prompt += `(No source data available - synthesize from your training knowledge)\n\n`
  }

  prompt += `Extract the etymology following the JSON schema in your instructions.`

  return prompt
}

/**
 * Quirky error messages for invalid inputs
 */
export const QUIRKY_MESSAGES = {
  nonsense: [
    "That's not a word — though it does have a certain Proto-Keyboard charm.",
    "Hmm, that sequence of letters hasn't made it into any dictionary... yet.",
    "Not a recognized word — perhaps it's from a language yet to be invented?",
    "That doesn't appear in our lexicon, but points for creativity!",
    'No etymology found — this word seems to exist only in the quantum realm.',
  ],
  empty: [
    'The search bar awaits your curiosity...',
    'Type a word to begin your etymological adventure.',
    'Enter a word and discover its hidden roots.',
  ],
}

/**
 * Get a random quirky message
 */
export function getQuirkyMessage(type: 'nonsense' | 'empty'): string {
  const messages = QUIRKY_MESSAGES[type]
  const index = Math.floor(Math.random() * messages.length)
  return messages[index]
}
