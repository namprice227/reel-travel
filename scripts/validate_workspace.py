"""Check planning integrity and local Markdown links; does not test the product."""
import csv
import re
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
errors = []

with (ROOT / "planning/tasks.csv").open(encoding="utf-8", newline="") as handle:
    tasks = list(csv.DictReader(handle))
ids = [task["id"] for task in tasks]
if len(ids) != len(set(ids)):
    errors.append("Duplicate task IDs")
by_id = {task["id"]: task for task in tasks}
points = Counter()
valid_statuses = {"todo", "in_progress", "blocked", "review", "done"}
for task in tasks:
    points[task["owner"]] += int(task["points"])
    if task["status"] not in valid_statuses:
        errors.append(f'{task["id"]}: invalid status')
    if task["owner"] == task["reviewer"]:
        errors.append(f'{task["id"]}: owner cannot self-review')
    if date.fromisoformat(task["due_date"]) > date(2026, 9, 25):
        errors.append(f'{task["id"]}: beyond team deadline')
    for dependency in filter(None, task["depends_on"].split(";")):
        if dependency not in by_id:
            errors.append(f'{task["id"]}: unknown dependency {dependency}')
        elif by_id[dependency]["due_date"] > task["due_date"]:
            errors.append(f'{task["id"]}: dependency due later than task')
    for folder in task["paths"].split(";"):
        if not (ROOT / folder).exists():
            errors.append(f'{task["id"]}: missing path {folder}')

visiting, visited = set(), set()
def visit(task_id):
    if task_id in visiting:
        errors.append(f"Dependency cycle at {task_id}")
        return
    if task_id in visited:
        return
    visiting.add(task_id)
    for dependency in filter(None, by_id[task_id]["depends_on"].split(";")):
        if dependency in by_id:
            visit(dependency)
    visiting.remove(task_id)
    visited.add(task_id)

for task_id in ids:
    visit(task_id)

milestone_owners = Counter()
for number in range(21):
    path = ROOT / f"deliverables/milestones/M{number:02}.md"
    if not path.exists():
        errors.append(f"Missing milestone M{number:02}")
        continue
    owner = re.search(r"Owner: (Member [1-4])", path.read_text(encoding="utf-8"))
    if not owner:
        errors.append(f"M{number:02}: missing owner")
    elif number:
        milestone_owners[owner.group(1)] += 1

for member in [f"Member {n}" for n in range(1, 5)]:
    if points[member] != 40:
        errors.append(f"{member}: expected 40 initial points, got {points[member]}")
    if milestone_owners[member] != 5:
        errors.append(f"{member}: expected five graded milestone owners")

markdown_paths = [ROOT / "README.md", ROOT / "AGENTS.md"]
for folder in ("planning", "docs", "deliverables", "apps", "packages", "database", "tests", "evals"):
    markdown_paths.extend((ROOT / folder).rglob("*.md"))
for path in markdown_paths:
    content = path.read_text(encoding="utf-8")
    content = re.sub(r"```.*?```", "", content, flags=re.S)
    for target in re.findall(r"\]\(([^)]+)\)", content):
        target = target.strip("<>")
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
            continue
        target = unquote(target.split("#", 1)[0])
        if target and not (path.parent / target).exists():
            errors.append(f"{path.relative_to(ROOT)}: broken link {target}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)
print(f"PASS: {len(tasks)} tasks; {sum(points.values())} points; 21 milestone drafts.")
print("PASS: equal initial allocations, valid dependencies/dates/paths and local Markdown links.")
print("This validates the planning scaffold only; no application has been implemented or tested.")
