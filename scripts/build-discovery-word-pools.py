"""Build advanced discovery pools from frequency and Wiktionary evidence.

Run with:

    uv run --with wordfreq python scripts/build-discovery-word-pools.py

The generated JSON is reviewed and committed, so this script and its Python
dependency are not part of the application runtime.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import random
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

from wordfreq import iter_wordlist, zipf_frequency

LANGUAGES = ("it", "es", "fr", "pt")
POOL_SIZE = 446
MIN_ZIPF = 2.8
MAX_ZIPF = 3.65
ALLOWED_POS = {"noun", "verb", "adj", "adv"}
POS_TARGETS = {"noun": 190, "adj": 110, "verb": 110, "adv": 20}
ANCESTRY_MARKERS = {
    "it": (
        "latino",
        "greco",
        "german",
        "arabo",
        "francese",
        "provenzale",
        "indoeurope",
    ),
    "es": ("latín", "griego", "germán", "árabe", "francés", "provenzal", "indoeurope"),
    "fr": ("latin", "grec", "german", "arabe", "italien", "provençal", "indo-europ"),
    "pt": ("latim", "grego", "germân", "árabe", "francês", "provençal", "indo-europ"),
}
REJECT_MARKERS = (
    "abreviação",
    "abréviation",
    "abbreviation",
    "acronym",
    "sigla",
    "surname",
    "sobrenome",
    "nom de famille",
    "cognome",
)
FORM_GLOSS_MARKERS = {
    "it": ("participio", "forma flessa", "voce verbale"),
    "es": ("participio", "forma verbal", "conjugación de"),
    "fr": ("participe", "forme fléchie", "flexion de"),
    "pt": ("particípio", "forma verbal", "conjugação de"),
}


def stable_noise(language: str, word: str) -> float:
    digest = hashlib.sha256(f"{language}:{word}".encode()).digest()
    return int.from_bytes(digest[:8], "big") / (2**64 - 1)


def normalized_letters(word: str) -> bool:
    normalized = unicodedata.normalize("NFC", word)
    return (
        word == normalized
        and word == word.lower()
        and word.isalpha()
        and 6 <= len(word) <= 16
    )


def frequency_candidates(language: str) -> dict[str, float]:
    candidates: dict[str, float] = {}
    for word in iter_wordlist(language):
        frequency = zipf_frequency(word, language)
        if frequency < MIN_ZIPF:
            break
        if frequency <= MAX_ZIPF and normalized_letters(word):
            candidates[word] = frequency
    return candidates


def is_inflected_form(entry: dict[str, Any]) -> bool:
    senses = entry.get("senses") or []
    return bool(senses) and all(
        sense.get("form_of")
        or sense.get("alt_of")
        or "form-of" in (sense.get("tags") or [])
        for sense in senses
    )


def score_entry(language: str, entry: dict[str, Any], frequency: float) -> float | None:
    word = entry["word"]
    etymology = " ".join(entry.get("etymology_texts") or []).strip()
    searchable = unicodedata.normalize("NFC", etymology).lower()
    metadata = " ".join(
        [
            searchable,
            " ".join(str(value) for value in entry.get("tags") or []),
            " ".join(str(value) for value in entry.get("categories") or []),
        ]
    ).lower()

    if len(etymology) < 16 or is_inflected_form(entry):
        return None
    if any(marker in metadata for marker in REJECT_MARKERS):
        return None

    ancestor_hits = sum(marker in searchable for marker in ANCESTRY_MARKERS[language])
    if ancestor_hits == 0:
        return None

    senses = entry.get("senses") or []
    glosses = [gloss for sense in senses for gloss in (sense.get("glosses") or [])]
    if not any(len(gloss.strip()) >= 8 for gloss in glosses):
        return None
    normalized_glosses = [
        unicodedata.normalize("NFC", gloss).lower() for gloss in glosses
    ]
    if normalized_glosses and all(
        any(marker in gloss for marker in FORM_GLOSS_MARKERS[language])
        for gloss in normalized_glosses
    ):
        return None

    frequency_fit = max(0.0, 1 - abs(frequency - 3.35) / 0.65)
    etymology_depth = min(math.log1p(len(etymology)) / math.log1p(500), 1.0)
    sense_depth = min(len(glosses) / 5, 1.0)
    length_fit = min(max(len(word) - 6, 0) / 8, 1.0)

    return (
        ancestor_hits * 1.4
        + etymology_depth * 1.3
        + frequency_fit
        + sense_depth * 0.45
        + length_fit * 0.2
        + stable_noise(language, word) * 0.35
    )


def load_qualified_entries(
    language: str, candidates: dict[str, float]
) -> list[dict[str, Any]]:
    url = f"https://kaikki.org/{language}wiktionary/raw-wiktextract-data.jsonl.gz"
    qualified: dict[tuple[str, str], dict[str, Any]] = {}
    print(f"{language}: reading {url}", file=sys.stderr, flush=True)

    request = urllib.request.Request(
        url, headers={"User-Agent": "EtymEx-pool-builder/1.0"}
    )
    with (
        urllib.request.urlopen(request) as response,
        gzip.GzipFile(fileobj=response) as stream,
    ):
        for raw_line in stream:
            entry = json.loads(raw_line)
            word = entry.get("word")
            pos = entry.get("pos")
            if (
                entry.get("lang_code") != language
                or word not in candidates
                or pos not in ALLOWED_POS
            ):
                continue

            score = score_entry(language, entry, candidates[word])
            if score is None:
                continue

            record = {
                "word": word,
                "pos": pos,
                "zipf": candidates[word],
                "score": round(score, 4),
                "etymology": " ".join(entry.get("etymology_texts") or []),
                "gloss": next(
                    (
                        gloss
                        for sense in entry.get("senses") or []
                        for gloss in sense.get("glosses") or []
                        if len(gloss.strip()) >= 8
                    ),
                    "",
                ),
            }
            key = (word, pos)
            if key not in qualified or record["score"] > qualified[key]["score"]:
                qualified[key] = record

    return list(qualified.values())


def select_pool(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_pos: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_pos[record["pos"]].append(record)
    for group in by_pos.values():
        group.sort(key=lambda item: (-item["score"], item["word"]))

    selected: dict[str, dict[str, Any]] = {}
    for pos, target in POS_TARGETS.items():
        for record in by_pos[pos]:
            if record["word"] not in selected:
                selected[record["word"]] = record
            if sum(item["pos"] == pos for item in selected.values()) >= target:
                break

    remaining = sorted(records, key=lambda item: (-item["score"], item["word"]))
    for record in remaining:
        if len(selected) >= POOL_SIZE:
            break
        selected.setdefault(record["word"], record)

    if len(selected) < POOL_SIZE:
        raise RuntimeError(
            f"Only {len(selected)} qualified unique words; need {POOL_SIZE}"
        )
    return sorted(selected.values(), key=lambda item: item["word"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/discovery-words.json")
    parser.add_argument("--audit", default="/tmp/etymex-discovery-word-audit.json")
    args = parser.parse_args()

    pools: dict[str, list[str]] = {}
    audit: dict[str, list[dict[str, Any]]] = {}
    audit_random = random.Random(20260729)

    for language in LANGUAGES:
        candidates = frequency_candidates(language)
        records = load_qualified_entries(language, candidates)
        selected = select_pool(records)
        pools[language] = [record["word"] for record in selected]
        audit[language] = audit_random.sample(selected, 20)
        counts = {
            pos: sum(record["pos"] == pos for record in selected) for pos in ALLOWED_POS
        }
        print(
            f"{language}: {len(candidates)} frequency candidates, {len(records)} qualified, "
            f"selected {len(selected)} {counts}",
            file=sys.stderr,
            flush=True,
        )

    Path(args.output).write_text(
        json.dumps(pools, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    Path(args.audit).write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
