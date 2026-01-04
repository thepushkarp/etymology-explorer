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
      "relatedWords": ["6-8 GRE-level words sharing this root"],
      "ancestorRoots": ["older forms like PIE roots, optional"],
      "descendantWords": ["modern derivatives in other languages, optional"]
    }
  ],
  "lore": "4-6 sentences of rich etymology narrative...",
  "sources": ["list which sources contributed: etymonline, wiktionary, or synthesized"]
}

Guidelines:
- ROOTS: Include ALL constituent roots. Simple words may have just 1 root, compound words like "telephone" have 2 (tele + phone), complex words like "autobiography" have 3+ (auto + bio + graph). Never force exactly 2 roots.
- RELATED WORDS: Prioritize GRE/TOEFL-relevant words over obscure terms. Include 6-8 words per root.
- ANCESTOR ROOTS: When available, include Proto-Indo-European (PIE) or older language roots to show deep ancestry.
- LORE: Write 4-6 rich sentences that tell the word's story:
  * Trace the word's journey through languages (PIE → Greek → Latin → French → English)
  * Include historical/cultural context (when and why meanings shifted)
  * Connect to sibling words and cognates in other languages
  * Add memorable anecdotes or metaphors that aid retention
  * Reference the research context provided about related roots
- Be accurate about language origins (Latin, Greek, Proto-Indo-European, Old French, Germanic, etc.)
- Keep the definition brief - we're not a dictionary
- Output ONLY valid JSON, no markdown or explanation`

/**
 * Build the user prompt with source data (legacy simple format)
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
 * Build a rich user prompt from agentic research context
 */
export function buildRichUserPrompt(word: string, researchData: string): string {
  let prompt = `Analyze the etymology of: "${word}"\n\n`

  prompt += `I've conducted deep research on this word, its roots, and related terms. Use this comprehensive data to create a rich etymology with detailed lore:\n\n`
  prompt += researchData
  prompt += `\n\n`

  prompt += `Using all the research above, extract a comprehensive etymology. Pay special attention to:
1. Identify ALL constituent roots (1 to many based on the word's composition)
2. Trace the etymological ancestry through language layers
3. Connect related words and cognates mentioned in the research
4. Write rich, memorable lore (4-6 sentences) that tells the word's full story

Follow the JSON schema in your instructions.`

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
