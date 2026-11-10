/**
 * FAQ content for etymology educational pages
 * This data drives both the visible UI and FAQPage JSON-LD schema
 */

export interface FaqItem {
  /** The question text */
  question: string
  /** Answer text - plain text only, no HTML/markdown */
  answer: string
  /** Optional link to demonstrate with search */
  searchExample?: string
}

export const faqs: FaqItem[] = [
  {
    question: 'What is etymology?',
    answer:
      'Etymology is the study of the origin of words and how their meanings have evolved over time. It traces words back through history, often across multiple languages, to uncover their earliest known forms and the cultural contexts that shaped them.',
  },
  {
    question: 'Where does the word "etymology" come from?',
    answer:
      'The word "etymology" comes from the Greek "etymologia," combining "etymon" (true sense of a word) and "logia" (study of). It entered English in the 14th century via Latin. So etymology is, quite literally, the study of the true meaning of words.',
  },
  {
    question: 'What percentage of English words come from Latin?',
    answer:
      'Approximately 29% of English words derive directly from Latin, with another 29% coming from French (which itself largely derives from Latin). About 26% come from Germanic languages, and the remaining 16% from Greek and other sources.',
  },
  {
    question: 'How do words change meaning over time?',
    answer:
      'Words evolve through several processes: semantic shift (where "nice" originally meant "ignorant" in Latin), borrowing from other languages (like "algorithm" from Arabic), compounding existing words (like "smartphone"), and back-formation (where "edit" was derived from "editor").',
    searchExample: 'nice',
  },
  {
    question: 'What is Proto-Indo-European?',
    answer:
      "Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European language family, believed to have been spoken approximately 4500-2500 BCE. It is the root of languages including English, Spanish, Hindi, Russian, and Greek—connecting roughly half of the world's population through linguistic heritage.",
  },
  {
    question: 'How can I use Etymology Explorer?',
    answer:
      'Type a word or phrase and press Enter. Auto discovers which supported languages use that spelling and traces their independent histories in language tabs. You can choose a language to include specialist-only entries. Explanations are in English, with examples in the word’s language and English translations. Attested lineage forms and source-listed spellings link to their own word pages; each history keeps its own spelling counterparts. Romanized input can offer a native spelling when Wiktionary explicitly identifies it. These links start a trace only when clicked. Saved entries remain readable; a Retrace link appears when their research is due for an update.',
  },
  {
    question: 'Which languages can I explore?',
    answer:
      'Etymology Explorer supports nine languages: English, Italian, Spanish, French, Portuguese, Hindi, Urdu, Sanskrit, and Japanese. Enter Hindi and Sanskrit in Devanagari, Urdu in Arabic script, and Japanese in kanji or kana. Explanations stay in English, with source-backed transliterations where available. Japanese histories use English Wiktionary with native-edition context and supplementary JMdict lexical data via Jisho. Japanese word-origin labels appear only when supported by sources. Pronunciation audio is generated for the selected word and language, independently of a history’s displayed IPA. Audio is available for Hindi, Urdu, and Japanese. Sanskrit entries offer a labelled Hindi reading of the Devanagari spelling. Usage charts for these four languages are unavailable.',
    searchExample: 'पानी',
  },
]
