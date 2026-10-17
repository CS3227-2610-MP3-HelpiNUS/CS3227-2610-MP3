"""Extract current incomplete RTT assertions and their independently audited work class."""

from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
matrix = (HERE / "Sprint2CaseMatrix.md").read_text(encoding="utf-8")
historical = (HERE / "PartialCaseDisposition.md").read_text(encoding="utf-8")
classes = {}
for line in historical.splitlines():
    match = re.match(r"^\| (F0[12]-TC-\d{3}) \|", line)
    if match:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        classes[match.group(1)] = cells[2]

# The approved RTT row controls when a historical classification was overbroad.
classes["F01-TC-034"] = "Local"
classes["F01-TC-046"] = "Local document/H audit"

sections = re.split(r"(?=^### F0[12]-TC-\d{3} — )", matrix, flags=re.M)
rows = []
for section in sections:
    header = re.match(r"^### (F0[12]-TC-\d{3}) — (PASS|PARTIAL|BLOCKED|FAIL|NOT RUN)", section)
    if not header or header.group(2) == "PASS":
        continue
    case = header.group(1)
    gap = re.search(r"^- \*\*Missing assertion/evidence or blocker:\*\* (.+)$", section, flags=re.M)
    action = re.search(r"^- \*\*Action and fixture:\*\* (.+)$", section, flags=re.M)
    if not gap or not action or case not in classes:
        raise ValueError(f"Incomplete disposition for {case}")
    rows.append((case, header.group(2), classes[case], gap.group(1), action.group(1)))

if len(re.findall(r"^### F0[12]-TC-\d{3} — ", matrix, flags=re.M)) != 91:
    raise ValueError("Matrix does not contain all 91 approved cases")

lines = [
    "# Current incomplete F01/F02 RTT cases",
    "",
    "Derived from the current 91-case matrix at the 2026-10-17 Sprint 2 development checkpoint. The historical 71-case classification is preserved in `PartialCaseDisposition.md`. Classes may be mixed: Local is executable in this checkout; Correction requires product or test work; Manual requires the approved H observation; External requires real data, exact-revision CI or other outside evidence. The matrix retains full requirements, executed evidence and required evidence classes. The remaining local cases are deferred to a later scoped verification pass rather than claimed complete by this checkpoint.",
    "",
    f"**Remaining:** {len(rows)} PARTIAL; 0 BLOCKED, 0 FAIL, 0 NOT RUN.",
    "",
    "| Case | Status | Work class | Exact missing assertion/evidence | Required fixture/action |",
    "| --- | --- | --- | --- | --- |",
]
for case, status, work_class, gap, action in rows:
    lines.append(f"| {case} | {status} | {work_class} | {gap} | {action} |")

(HERE / "RemainingCaseDisposition.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {len(rows)} incomplete cases")
