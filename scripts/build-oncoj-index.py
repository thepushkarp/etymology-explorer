"""Build the server's exact-transcription index from pinned ONCOJ lexical annotations."""

import hashlib
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

REVISION = "fd34a1b284c5dd1e8008df9d3abcb28cfaf464bf"
SHA256 = "b6c06d00e61c53325217b5494e64130297ad1f30aa9c9dd1347472b8a23b6d2f"
URL = f"https://raw.githubusercontent.com/ONCOJ/data/{REVISION}/lexicon.xml"
NS = {"t": "http://www.tei-c.org/ns/1.0"}
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"


def text(node):
    return " ".join("".join(node.itertext()).split())


def build():
    raw = urllib.request.urlopen(URL, timeout=30).read()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError("ONCOJ XML checksum does not match the pinned revision")
    # Retain the complete source record verbatim, including notes and source IDs.
    records = []
    for xml in re.findall(r"<superEntry\b[\s\S]*?</superEntry>", raw.decode("utf-8")):
        parent = ET.fromstring(f'<div xmlns="{NS["t"]}">{xml}</div>')[0]
        entries = []
        for entry in parent.findall("t:entry", NS):
            forms = [text(node) for node in entry.findall("t:form/t:orth", NS)]
            relations = [
                {"targetId": ref.attrib["target"], "form": text(ref)}
                for ref in entry.findall('t:re[@type="derivation"]/t:form/t:orth/t:ref', NS)
                if ref.attrib.get("target")
            ]
            entries.append({"id": entry.attrib[XML_ID], "forms": forms, "derivations": relations})
        records.append({"id": parent.attrib[XML_ID], "entries": entries, "xml": xml})
    result = {"revision": REVISION, "sha256": SHA256, "source": URL,
              "license": "CC BY 4.0 — corpus annotation (grammatical analysis)",
              "attribution": "National Institute for Japanese Language and Linguistics, Oxford-NINJAL Corpus of Old Japanese", "records": records}
    path = Path(__file__).resolve().parents[1] / "data" / "oncoj-index.json"
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Indexed {len(records)} complete ONCOJ lexical records at {REVISION}")


if __name__ == "__main__":
    build()
