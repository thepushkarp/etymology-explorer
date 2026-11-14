"""Index licensed NINJAL transcriptions/headword rows, with exact historical spellings."""

import argparse
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATASETS = {
    "wamyo": {"title": "Wamyō ruijushō (1617 edition)", "url": "https://www2.ninjal.ac.jp/textdb_dataset/en/kwrs/",
              "scope": "Historical lexicographical commentary. Chinese character explanations do not establish Japanese word ancestry. Transcription generally modernizes character shapes.",
              "attribution": "NINJAL / NIHU"},
    "tetsugaku": {"title": "Tetsugaku jii (1881)", "url": "https://www2.ninjal.ac.jp/textdb_dataset/en/tgzi/",
                 "scope": "Dated terminology and translation attestations; neither first coinage nor borrowing direction is established.",
                 "attribution": "Prof. Okajima Akihiro, Osaka University; published by NINJAL"},
    "genkai": {"title": "Genkai headword data (1889–1891; dataset 202510)", "url": "https://www2.ninjal.ac.jp/textdb_dataset/en/genk/index.html",
               "scope": "Historical headwords and metadata only; dictionary definitions and etymology prose are not included. Linked facsimiles and JapanKnowledge entries are outside this dataset.",
               "attribution": "NINJAL"},
    "nippo": {"title": "Nippojisho headword data (1603; dataset 202510)", "url": "https://www2.ninjal.ac.jp/textdb_dataset/en/nipp/",
              "scope": "Historical romanized headwords with editorial katakana transcriptions, not full Portuguese definitions. Modernized verb forms are editorial metadata, not historical attestations. Linked facsimiles are outside this dataset.",
              "attribution": "NINJAL"},
}


def valid_form(value):
    return bool(value) and len(value) <= 120 and all(c.isalpha() or unicodedata.category(c).startswith("M") or c == "ー" for c in value)


def build(cache):
    resources = json.loads((ROOT / "data/japanese-historical-sources.json").read_text())
    records = []
    forms = {}

    def add(dataset, keys, source_id, text, url):
        keys = sorted({unicodedata.normalize("NFC", key).lower() for key in keys if valid_form(key)})
        if not keys:
            return
        index = len(records)
        records.append({"dataset": dataset, "id": source_id, "text": text, "url": url})
        for key in keys:
            forms.setdefault(key, []).append(index)

    for resource in resources:
        raw = (cache / resource["name"]).read_bytes() if cache else urllib.request.urlopen(resource["url"], timeout=30).read()
        if hashlib.sha256(raw).hexdigest() != resource["sha256"]:
            raise ValueError(f"NINJAL checksum mismatch: {resource['url']}")
        dataset = resource["dataset"]
        if dataset in ["genkai", "nippo"]:
            archive = zipfile.ZipFile(io.BytesIO(raw))
            name = next(name for name in archive.namelist() if name.endswith('.txt') and 'readme' not in name)
            for row in csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig')), delimiter='\t'):
                keys = [row["見出し語"], row["見出し語（漢字表記）"]] if dataset == "genkai" else [row["見出し語（片仮名）"]]
                add(dataset, keys, row["整理番号"], json.dumps(row, ensure_ascii=False), resource["url"])
        else:
            text = raw.decode('utf-8-sig')
            if dataset == "wamyo":
                for line in text.splitlines():
                    cells = line.split('\t')
                    if len(cells) == 3 and re.match(r"^巻\d+・", cells[0]):
                        add(dataset, [cells[1].split('［')[0]], cells[0], line, resource["url"])
            else:
                entries = []
                current = None
                for line_number, line in enumerate(text.splitlines(), 1):
                    match = re.match(r"^[A-Za-z＿][^　]*　(.+)$", line)
                    if match:
                        current = {"line": line_number, "keys": [re.split('[（［]', s)[0] for s in match[1].split('、')], "lines": [line]}
                        entries.append(current)
                    elif current and line.strip() and not re.fullmatch(r"（[０-９0-9]+）", line):
                        current["lines"].append(line)
                for entry in entries:
                    add(dataset, entry["keys"], f"line:{entry['line']}", '\n'.join(entry["lines"]), resource["url"])
    payload = gzip.compress(json.dumps({"forms": forms, "records": records}, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    (ROOT / "data/japanese-historical.json.gz").write_bytes(payload)
    manifest = {"datasets": DATASETS, "records": len(records), "sha256": hashlib.sha256(payload).hexdigest(),
                "license": "CC BY 4.0 (released transcriptions and headword data only)",
                "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"}
    (ROOT / "data/japanese-historical-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f"Indexed {len(records)} historical records / {len(forms)} exact forms; {len(payload) / 1048576:.1f} MiB")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path)
    build(parser.parse_args().cache)
