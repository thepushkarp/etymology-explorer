# Advanced discovery word pools

The **Surprise me** action uses 446 words for each supported language. English retains the
existing GRE-oriented list. Italian, Spanish, French, and Portuguese use advanced discovery
pools: uncommon, attested dictionary lemmas chosen for a substantive etymology rather than as
claims about an official GRE equivalent.

## Generation rules

`scripts/build-discovery-word-pools.py` applies the same pipeline to every beta language:

1. Start with the language's `wordfreq` list and retain single lowercase words with a Zipf
   frequency from 2.8 through 3.65.
2. Require a matching lemma in that language's native Wiktionary extraction from Kaikki.
3. Keep nouns, verbs, adjectives, and adverbs with a real gloss and substantive etymology.
4. Require an ancestry marker such as Latin, Greek, Germanic, Arabic, or Indo-European.
5. Reject proper-name-like entries, abbreviations, acronyms, and inflected-form-only entries.
6. Rank the remaining entries by etymology depth, frequency fit, sense coverage, and a stable
   diversity term; then select a part-of-speech-balanced set of 446 unique words.

The generator is an offline review tool. It does not add Python or source-dump downloads to the
application runtime.

## Random-sample audit

The generation run on 2026-07-29 sampled 20 words from each final pool using the fixed audit seed
`20260729`. All 80 sampled items were inspected for selected-language lemma validity, frequency,
part of speech, and a non-trivial etymology. The samples were:

- **Italian**: treccia, evangelizzazione, poligono, glucosio, epifania, proiettare, termometro,
  carismatico, custodire, coincidere, bretone, canapa, cinismo, cripta, sinagoga, ipnotico,
  autorizzare, terapeutico, zoccolo, geometra.
- **Spanish**: encantar, mogollón, enclave, rabino, radiografía, escandinavo, chusma, presidir,
  destinatario, portuario, ahogar, revólver, relacionar, astronomía, flagelo, palenque, acatar,
  incurrir, homólogo, duplicar.
- **French**: trèfle, stigmatiser, losange, topographie, vacciner, éolien, farouche, heurter,
  zodiaque, coqueluche, héréditaire, méridien, naitre, élastique, phénix, miniature, parmesan,
  incognito, éponyme, italique.
- **Portuguese**: zodíaco, diagnosticar, bálsamo, orquídea, incompetente, aristocracia,
  antibiótico, patriótico, antagonista, subtrair, cirúrgico, implorar, dureza, sarcástico,
  eminente, patético, heterogêneo, latente, ligeira, fabuloso.

The first audit used a looser ceiling and surfaced ordinary vocabulary and an inflected Portuguese
form. The ceiling was reduced from 4.0 to 3.65 and localized participle/form markers were added
before the final pools and sample above were produced.

## Sources and attribution

- Frequency candidates and Zipf scores come from
  [`wordfreq`](https://github.com/rspeer/wordfreq). Its language data is distributed under
  CC BY-SA 4.0.
- Lemma, part-of-speech, gloss, and etymology admission data comes from
  [Kaikki/Wiktextract](https://kaikki.org/dictionary/rawdata.html), derived from the Italian,
  Spanish, French, and Portuguese Wiktionary editions. Wiktionary data is available under
  CC BY-SA and GFDL.

Only the reviewed word strings are loaded by the application. Frequencies, glosses, etymology
text, and source dumps remain offline generation inputs.
