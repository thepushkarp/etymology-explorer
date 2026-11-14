"""Build exact-lookup shards from the official English JMdict XML download.

Pass --source and --sha256 to admit a new snapshot. Without them, the current
manifest's checksum must match; a moving upstream download cannot silently
replace a reviewed snapshot. Distribute the generated data under CC BY-SA 4.0.
"""

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "jmdict"
URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"


def values(node, tag):
    return ["".join(child.itertext()) for child in node.findall(tag)]


def normalize(word):
    return re.sub(r"[\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+", " ",
                  unicodedata.normalize("NFC", word).lower()).strip(" ")


def build(raw, expected):
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected:
        raise ValueError(f"JMdict checksum mismatch: expected {expected}, received {digest}")
    xml = gzip.decompress(raw).decode("utf-8")
    date = re.search(r"JMdict created: (\d{4}-\d{2}-\d{2})", xml).group(1)
    root = ET.fromstring(xml)
    shards = {f"{kind}-{i:02x}.json.gz": {} for kind in ["forms", "entries"] for i in range(64)}
    count = 0
    for element in root.findall("entry"):
        kanji = [{"word": node.findtext("keb"), "info": values(node, "ke_inf"),
                  "priority": values(node, "ke_pri")} for node in element.findall("k_ele")]
        readings = [{"word": node.findtext("reb"), "noKanji": node.find("re_nokanji") is not None,
                     "restrict": values(node, "re_restr"), "info": values(node, "re_inf"),
                     "priority": values(node, "re_pri")} for node in element.findall("r_ele")]
        senses = []
        pos = []
        for node in element.findall("sense"):
            pos = values(node, "pos") or pos
            glosses = ["".join(g.itertext()) for g in node.findall("gloss")
                       if g.get(XML_LANG, "eng") == "eng"]
            senses.append({"kanji": values(node, "stagk"), "readings": values(node, "stagr"),
                           "pos": pos, "glosses": glosses,
                           "loans": [{"language": item.get(XML_LANG, "eng"),
                                      "text": item.text or "", "type": item.get("ls_type", "full"),
                                      "wasei": item.get("ls_wasei") is not None}
                                     for item in node.findall("lsource")],
                           "xml": ET.tostring(node, encoding="unicode").strip()})
        record = {"id": element.findtext("ent_seq"), "kanji": kanji, "readings": readings,
                  "senses": senses, "xml": ET.tostring(element, encoding="unicode").strip()}
        words = sorted({normalize(node["word"]) for node in kanji + readings})
        entry_bucket = int(hashlib.sha256(record["id"].encode()).hexdigest()[:2], 16) % 64
        shards[f"entries-{entry_bucket:02x}.json.gz"][record["id"]] = record
        for word in words:
            bucket = int(hashlib.sha256(word.encode()).hexdigest()[:2], 16) % 64
            shards[f"forms-{bucket:02x}.json.gz"].setdefault(word, []).append(record["id"])
        count += 1
    if count < 200000:
        raise ValueError(f"JMdict snapshot unexpectedly small: {count} entries")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checksums = {}
    for name, shard in shards.items():
        payload = gzip.compress(json.dumps(shard, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0)
        (OUTPUT / name).write_bytes(payload)
        checksums[name] = hashlib.sha256(payload).hexdigest()
    manifest = {"source": URL, "sha256": digest, "date": date, "entries": count,
                "shards": checksums, "license": "CC BY-SA 4.0",
                "attribution": "JMdict — Electronic Dictionary Research and Development Group",
                "licenseUrl": "https://www.edrdg.org/edrdg/licence.html"}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Indexed {count} JMdict entries dated {date}; {sum((OUTPUT / name).stat().st_size for name in checksums) / 1048576:.1f} MiB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--sha256")
    args = parser.parse_args()
    expected = args.sha256 or json.loads((OUTPUT / "manifest.json").read_text())["sha256"]
    raw = args.source.read_bytes() if args.source else urllib.request.urlopen(URL, timeout=90).read()
    build(raw, expected)
