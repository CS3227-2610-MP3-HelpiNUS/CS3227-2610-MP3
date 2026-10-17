"""Build a PRD requirement/AC to approved RTT case reverse index.

This is an ID-mapping audit, not a semantic or executed-evidence PASS claim.
"""

from collections import defaultdict
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification-evidence" / "TraceabilityInventory.md"
COUNTS = {
    "F01": {"FR": 12, "NFR": 7, "AC": 45},
    "F02": {"FR": 23, "NFR": 9, "AC": 44},
}
TOKEN = re.compile(r"\b(FR|NFR|AC)-(\d{2})(?:[–-](?:(?:FR|NFR|AC)-)?(\d{2}))?")


def expanded(text: str) -> set[str]:
    result: set[str] = set()
    for match in TOKEN.finditer(text):
        kind, start, end = match.groups()
        first = int(start)
        last = int(end) if end else first
        if last < first or last - first > 100:
            raise ValueError(f"Invalid requirement range: {match.group()}")
        result.update(f"{kind}-{number:02d}" for number in range(first, last + 1))
    return result


lines = [
    "# Sprint 2 PRD to RTT ID inventory",
    "",
    "This reverse index identifies each approved PRD FR, NFR and AC and the F01/F02 RTT cases that mention it. "
    "It checks presence and numbering only. The [case matrix](Sprint2CaseMatrix.md) records each RTT action, assertion, "
    "evidence class and current outcome; neither document by itself proves semantic coverage or a PASS result.",
    "",
]

for feature, expected_counts in COUNTS.items():
    base = ROOT / "docs" / "features" / f"S2-D2-{feature}"
    prd = (base / "PRD.md").read_text(encoding="utf-8").splitlines()
    rtt = (base / "RequirementsToTests.md").read_text(encoding="utf-8").splitlines()
    defined = {"FR": set(), "NFR": set(), "AC": set()}
    for line in prd:
        match = re.match(r"^###\s+(FR-\d{2})\b", line)
        if match:
            defined["FR"].add(match.group(1))
        match = re.match(r"^\|\s*(NFR-\d{2}|AC-\d{2})\b", line)
        if match:
            defined[match.group(1).split("-")[0]].add(match.group(1))
    mappings: dict[str, set[str]] = defaultdict(set)
    cases: set[str] = set()
    for line in rtt:
        match = re.match(r"^\|\s*\*\*(F0[12]-TC-\d{3})\*\*([^|]*)\|", line)
        if not match:
            continue
        case, trace = match.groups()
        cases.add(case)
        for requirement in expanded(trace):
            mappings[requirement].add(case)
    if feature == "F02":
        # The approved F02 RTT records NFR-01–07 in its explicit NFR-to-TC
        # paragraph rather than repeating them in each case's first cell.
        nfr_lines = [line for line in rtt if line.startswith("**Non-functional requirements:**")]
        if len(nfr_lines) != 1:
            raise ValueError("Expected one approved F02 NFR mapping paragraph")
        for requirement, references in re.findall(r"(NFR-\d{2})\s*→\s*([^;.]*)", nfr_lines[0]):
            for case_match in re.finditer(r"(?:TC-)?(\d{3})(?:[–-](\d{3}))?", references):
                first, last = case_match.groups()
                for number in range(int(first), int(last or first) + 1):
                    mappings[requirement].add(f"F02-TC-{number:03d}")
    if len(cases) != (46 if feature == "F01" else 45):
        raise ValueError(f"Unexpected {feature} case count: {len(cases)}")
    lines += [f"## {feature}", ""]
    if feature == "F02":
        lines += ["F02 NFR-01–07 mappings come from the approved RTT's explicit non-functional-requirements paragraph, while NFR-08/09 also appear in case-row traces. The case matrix copies row traces verbatim.", ""]
    for kind, count in expected_counts.items():
        expected = {f"{kind}-{number:02d}" for number in range(1, count + 1)}
        if defined[kind] != expected:
            raise ValueError(f"{feature} PRD {kind}: defined={sorted(defined[kind])}, expected={sorted(expected)}")
        absent = sorted(expected - mappings.keys())
        lines += [f"### {kind}: {count} defined, {count - len(absent)} mentioned in RTT", ""]
        if absent:
            lines += [f"Missing RTT references: {', '.join(absent)}", ""]
        lines += ["| PRD ID | RTT cases mentioning ID |", "| --- | --- |"]
        for requirement in sorted(expected):
            lines.append(f"| {requirement} | {', '.join(sorted(mappings.get(requirement, []))) or 'NONE'} |")
        lines.append("")

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {OUT}")
