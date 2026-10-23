"""Render the approved F01/F02 RTT cases beside their execution ledgers.

Run from the repository root with: python verification-evidence/generate_matrix.py
The source RTT documents are read only. This script does not infer PASS from tests.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification-evidence" / "Sprint2CaseMatrix.md"


def cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


lines = [
    "# Sprint 2 F01/F02 case-by-case evidence matrix",
    "",
    "This matrix copies each approved RTT action, assertion, and evidence contract next to its execution ledger. "
    "A listed test or generic suite pass does not itself close a case. The feature handoffs retain the "
    "historical commands and outcomes; the final verification report records this pass's commands.",
    "",
]

for feature in ("F01", "F02"):
    prefix = f"S2-D2-{feature}"
    rtt_path = ROOT / "docs" / "features" / prefix / "RequirementsToTests.md"
    ledger_path = ROOT / "workflow" / "handoffs" / "royden" / f"{prefix}.md"
    rtt = {}
    for line in rtt_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*\*\*(F0[12]-TC-\d{3})\*\*", line)
        if match:
            row = cells(line)
            if len(row) < 4:
                raise ValueError(f"Malformed RTT row: {line}")
            rtt[match.group(1)] = row[:4]

    ledger = {}
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\|\s*(F0[12]-TC-\d{3})\s*\|", line)
        if match:
            ledger[match.group(1)] = cells(line)

    expected = 46 if feature == "F01" else 45
    if len(rtt) != expected or len(ledger) != expected or rtt.keys() != ledger.keys():
        raise ValueError(f"{feature} RTT/ledger mismatch: RTT={len(rtt)} ledger={len(ledger)}")

    lines += [f"## {feature}: {len(rtt)} approved cases", ""]
    for case_id, row in rtt.items():
        recorded = ledger[case_id]
        status = recorded[3]
        evidence = recorded[4]
        if len(recorded) > 5:
            gap = recorded[5]
        elif " Closure: " in evidence:
            evidence, gap = evidence.split(" Closure: ", 1)
        elif " Remaining: " in evidence:
            evidence, gap = evidence.split(" Remaining: ", 1)
        elif " Missing " in evidence:
            evidence, gap = evidence.split(" Missing ", 1)
        elif " missing " in evidence:
            evidence, gap = evidence.split(" missing ", 1)
        else:
            gap = "The complete approved assertion and evidence contract above has not been demonstrated."
        lines += [
            f"### {case_id} — {status}",
            "",
            f"- **Trace:** {row[0]}",
            f"- **Action and fixture:** {row[1]}",
            f"- **Required assertions:** {row[2]}",
            f"- **Required evidence:** {row[3]}",
            f"- **Executed evidence recorded:** {evidence}",
            f"- **{'Closure' if status == 'PASS' else 'Missing assertion/evidence or blocker'}:** {gap}",
            "",
        ]

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {OUT} with 91 case records")
