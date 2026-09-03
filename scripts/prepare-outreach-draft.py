"""Extract a deterministic, deduplicated Nexus outreach pilot from the prospect workbook."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

def cell_column(reference):
    return re.match(r"[A-Z]+", reference).group()

def main():
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    with zipfile.ZipFile(source) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in item.findall(".//m:t", NS)) for item in root.findall("m:si", NS)]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in rels}
        sheet = next(item for item in workbook.findall(".//m:sheet", NS) if item.attrib["name"] == "Prospects")
        target = targets[sheet.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
        target = target if target.startswith("xl/") else f"xl/{target}"
        xml = ET.fromstring(archive.read(target))
        rows = []
        for row in xml.findall(".//m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                value_node = cell.find("m:v", NS)
                value = "" if value_node is None else (value_node.text or "")
                if cell.attrib.get("t") == "s" and value:
                    value = shared[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(t.text or "" for t in cell.findall(".//m:t", NS))
                values[cell_column(cell.attrib["r"])] = value.strip()
            rows.append(values)

    eligible = []
    seen = set()
    email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    for row in rows[1:]:
        email = row.get("N", "").strip().lower()
        if row.get("B", "").upper() != "A" or row.get("F", "").lower() != "montgomery":
            continue
        if row.get("Q", "").lower() != "not contacted" or row.get("U", "").lower() != "no":
            continue
        contact_name = row.get("K", "").strip()
        if not contact_name or "@" in contact_name or not email_pattern.match(email) or email in seen:
            continue
        seen.add(email)
        eligible.append({
            "prospectId": row.get("A"), "tier": row.get("B"), "score": int(float(row.get("C") or 0)),
            "providerType": row.get("D"), "facility": row.get("E"), "county": row.get("F"),
            "contactName": row.get("K"), "buyerRole": row.get("L"), "phone": row.get("M"), "email": email,
            "sourceStatus": row.get("Q"), "optOut": False,
        })
    eligible.sort(key=lambda item: (-item["score"], item["facility"].lower(), item["email"]))
    payload = {"source": source.name, "selection": {"tier": "A", "county": "Montgomery", "status": "Not Contacted", "optOut": "No", "limit": 25}, "eligibleCount": len(eligible), "recipients": eligible[:25]}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"eligible": len(eligible), "selected": len(payload["recipients"]), "output": str(destination)}))

if __name__ == "__main__":
    main()
