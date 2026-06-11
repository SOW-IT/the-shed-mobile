"""Builds convex/importData.ts from a parsed Firestore export of the old
THE SHED web app (project theshedsow).

One-off provenance script. Input is the JSON produced by running
`leveldb_export.parse_leveldb_documents` over every output-* file of a
Firestore backup, dumped as a flat list of documents that each carry a
`_key.path` like "users/users/2023/<uid>" or "departments/2023".

  python scripts/build-import-data.py <docs.json>

What it does:
- Groups user docs into people. A doc id is either a Firebase Auth uid or an
  email (admins could provision people by email before first sign-in). The
  same person can appear with different emails in different years, so docs
  are union-found into people via uid <-> email links, and every year of a
  person gets their single canonical email (the most recent one, preferring
  the Workspace domain). People with no email anywhere (pre-2022 history)
  get a synthetic, clearly-fake "@legacy.invalid" address.
- Emits per year: divisions, departments (head resolved from uid to email),
  universities (the distinct values used that year), the Budget Manager's
  email, and one profile per person with roles/department/division/university.
  Years before divisions existed get a single "General" division.
"""

import collections
import json
import re
import sys
import unicodedata

WORKSPACE_DOMAIN = "sowaustralia.com"
LEGACY_DOMAIN = "legacy.invalid"
FALLBACK_DIVISION = "General"
OUT_PATH = "convex/importData.ts"

# The org migrated its Workspace to sow.org.au. Years listed here get their
# WORKSPACE_DOMAIN emails re-keyed to the new domain (same local part), so
# the import matches the live data after importHistory:migrateEmailDomain.
DOMAIN_MIGRATED_YEARS = {2026: "sow.org.au"}

# Corrections to records the old web app itself had wrong, keyed by
# (year, any email of the person). The fields replace the person's
# role/department/division/university for that year; identity (email,
# importId, name) is kept. A year the backup has no doc for gains a row.
PROFILE_OVERRIDES: dict[tuple[int, str], dict] = {
    # Daniel Kim's history (confirmed by him, Jun 2026): 2019 was missing,
    # 2022 carried a stray university, 2025 repeated his 2020 Student
    # Leader year instead of Head of Department - Data and IT.
    (2019, "daniel.kim@sowaustralia.com"): {
        "roles": ["Member"],
        "university": "University of New South Wales",
    },
    (2022, "daniel.kim@sowaustralia.com"): {
        "roles": ["Staff"],
        "department": "Finance and IT",
    },
    (2025, "daniel.kim@sowaustralia.com"): {
        "roles": ["Head of Department"],
        "department": "Data and IT",
    },
}


def migrate_domain(email, year):
    new_domain = DOMAIN_MIGRATED_YEARS.get(year)
    if email and new_domain and email.endswith("@" + WORKSPACE_DOMAIN):
        return f"{email.split('@')[0]}@{new_domain}"
    return email

docs = json.load(open(sys.argv[1], encoding="utf-8"))

user_docs = []  # (year:int, doc_id, body)
dept_docs = {}  # year -> body
division_docs = {}  # year -> body
for d in docs:
    path = d["_key"]["path"].split("/")
    if path[0] == "users" and len(path) == 4:
        user_docs.append((int(path[2]), path[3], d))
    elif path[0] == "departments" and len(path) == 2:
        dept_docs[int(path[1])] = d
    elif path[0] == "divisions" and len(path) == 2:
        division_docs[int(path[1])] = d

# ---- Group docs into people (union-find over uids and emails) ----
parent: dict[str, str] = {}


def find(x: str) -> str:
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a: str, b: str) -> None:
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb


def doc_key(doc_id: str) -> str:
    return doc_id.lower() if "@" in doc_id else doc_id


for _, doc_id, d in user_docs:
    key = doc_key(doc_id)
    find(key)
    email = (d.get("email") or "").strip().lower()
    if email:
        union(key, email)

person_docs: dict[str, list] = collections.defaultdict(list)
for year, doc_id, d in user_docs:
    person_docs[find(doc_key(doc_id))].append((year, doc_id, d))

# ---- Canonical identity per person ----
def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", ".", text.lower()).strip(".") or "person"


person_email: dict[str, str] = {}  # group root -> canonical email
person_import_id: dict[str, str] = {}  # group root -> durable person key
person_name: dict[str, str | None] = {}
uid_to_root: dict[str, str] = {}

for root, entries in person_docs.items():
    entries.sort(key=lambda e: e[0])
    # Email candidates: (year, prefers-workspace-domain, email)
    candidates = []
    uids = []
    name = None
    for year, doc_id, d in entries:
        for email in [
            doc_id.lower() if "@" in doc_id else None,
            (d.get("email") or "").strip().lower() or None,
        ]:
            if email:
                candidates.append((year, email.endswith("@" + WORKSPACE_DOMAIN), email))
        if "@" not in doc_id:
            uids.append(doc_id)
        first, last = d.get("firstName", "").strip(), d.get("lastName", "").strip()
        if first or last:
            name = " ".join(p for p in [first, last] if p)
    for uid in uids:
        uid_to_root[uid] = root
    person_import_id[root] = uids[0] if uids else sorted({e for _, _, e in candidates})[0]
    person_name[root] = name
    if candidates:
        candidates.sort(key=lambda c: (c[0], c[1]))  # latest year, workspace wins
        person_email[root] = candidates[-1][2]
    else:
        person_email[root] = (
            f"{slugify(name or 'person')}.{slugify(person_import_id[root])[:6]}"
            f"@{LEGACY_DOMAIN}"
        )

# Two people must never share a canonical email (getProfile uses .unique()).
by_email = collections.Counter(person_email.values())
clashes = {e for e, n in by_email.items() if n > 1}
assert not clashes, f"canonical email collisions: {clashes}"


def email_for(doc_id: str | None) -> str | None:
    """Canonical email for a head/budget-manager reference (uid or email)."""
    if not doc_id:
        return None
    root = uid_to_root.get(doc_id) or (
        find(doc_id.lower()) if doc_id.lower() in parent else None
    )
    return person_email.get(root) if root else None


# ---- Assemble per-year payloads ----
years = sorted({y for y, _, _ in user_docs} | set(dept_docs) | set(division_docs))
payload_years = []
for year in years:
    dept_body = dept_docs.get(year, {})
    departments = []
    division_names = set(division_docs.get(year, {}).get("divisions", {}))
    for name, info in (dept_body.get("departments") or {}).items():
        division = info.get("division") or FALLBACK_DIVISION
        division_names.add(division)
        department = {
            "name": name,
            "division": division,
            "headEmail": migrate_domain(email_for(info.get("head")), year),
            "colour": info.get("colour"),
        }
        departments.append({k: v for k, v in department.items() if v is not None})

    # One profile per person per year, merging that person's docs (a person
    # can have both an email-keyed and a uid-keyed doc in the same year).
    merged: dict[str, dict] = {}
    universities = set()
    for root, entries in person_docs.items():
        year_docs = [d for y, _, d in entries if y == year]
        if not year_docs:
            continue
        body: dict = {}
        for d in sorted(year_docs, key=lambda d: bool(d.get("role")), reverse=True):
            for field in ("role", "department", "division", "university"):
                body.setdefault(field, d.get(field))
        if body.get("university"):
            universities.add(body["university"])
        profile = {
            "email": migrate_domain(person_email[root], year),
            "importId": person_import_id[root],
            "name": person_name[root],
            "roles": [body["role"]] if body.get("role") else [],
            "department": body.get("department"),
            "division": body.get("division"),
            "university": body.get("university"),
        }
        merged[person_email[root]] = {
            k: v for k, v in profile.items() if v not in (None, [])
        }

    # Heads of Division named in divisions/{year} keep that division on their
    # profile so the org chart can find them (user docs often omit it).
    for division, info in (division_docs.get(year, {}).get("divisions") or {}).items():
        head_email = email_for(info.get("head"))
        profile = merged.get(head_email) if head_email else None
        if profile is not None and not profile.get("division"):
            profile["division"] = division

    # Hand-confirmed corrections override whatever the backup said.
    for (o_year, o_email), fields in PROFILE_OVERRIDES.items():
        if o_year != year:
            continue
        root = find(doc_key(o_email))
        assert root in person_email, f"override for unknown person: {o_email}"
        profile = {
            "email": migrate_domain(person_email[root], year),
            "importId": person_import_id[root],
            "name": person_name[root],
            **fields,
        }
        merged[person_email[root]] = {
            k: v for k, v in profile.items() if v not in (None, [])
        }
        if fields.get("university"):
            universities.add(fields["university"])

    year_payload = {
        "year": year,
        "divisions": sorted(division_names) or [FALLBACK_DIVISION],
        "departments": sorted(departments, key=lambda d: d["name"]),
        "universities": sorted(universities),
        "budgetManagerEmail": migrate_domain(
            email_for(dept_body.get("BUDGET_MANAGER")), year
        ),
        "profiles": sorted(merged.values(), key=lambda p: p["email"]),
    }
    payload_years.append({k: v for k, v in year_payload.items() if v is not None})

header = """\
// GENERATED by scripts/build-import-data.py from the 2026-06-11 Firestore
// backup of the old web app (project theshedsow). Do not edit by hand.
// Imported by importHistory.ts; safe to re-run (upserts by natural keys).

export interface ImportProfile {
  email: string;
  importId: string;
  name?: string;
  roles?: string[];
  department?: string;
  division?: string;
  university?: string;
}

export interface ImportYear {
  year: number;
  divisions: string[];
  departments: {
    name: string;
    division: string;
    headEmail?: string;
    colour?: string;
  }[];
  universities: string[];
  budgetManagerEmail?: string;
  profiles: ImportProfile[];
}

export const IMPORT_DATA: { years: ImportYear[] } = """
data = {"years": payload_years}
with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(header)
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write(";\n")

total = sum(len(y["profiles"]) for y in payload_years)
print(f"wrote {OUT_PATH}: {len(payload_years)} years, {total} profiles")
for y in payload_years:
    print(
        f"  {y['year']}: {len(y['profiles'])} profiles, "
        f"{len(y['departments'])} depts, {len(y['divisions'])} divisions, "
        f"{len(y['universities'])} unis, BM={y.get('budgetManagerEmail')}"
    )
