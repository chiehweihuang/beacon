# Q10 — Is the audit-results.json schema stable enough for third-party tooling?

Research artefact for ROADMAP Open Question 10. Assessment + draft only. No product code changed.

- **Repo snapshot**: Beacon v2.0.9 (`.claude-plugin/plugin.json:3`); ROADMAP last stamped v2.0.8.
- **Question (verbatim, ROADMAP.md:88)**: "Is the JSON schema stable enough to encourage third-party tooling (CI integrations, dashboard aggregators)? If yes, publish a JSON Schema document and version the schema separately from the plugin."
- **Related ROADMAP pointers**: a `references/audit-results.schema.json` is floated at ROADMAP.md:101; ARCHITECTURE.md:271 repeats the open question.

---

## 1. Verdict (read this first)

**Not yet. Do not encourage third-party CI integrations or dashboard aggregators against the current schema.**

The schema is *conceptually* mature and has converged over 9 patch releases, but it fails three hard prerequisites for an external data contract:

1. **No `schema_version` field exists anywhere.** A consumer cannot tell which shape it is parsing. This is the single blocking defect.
2. **The schema has two authorities that already disagree.** `commands/inspect.md` Step 6 (the producer instruction, inspect.md:439-508) and `scripts/generate-report.mjs` (the reference consumer) are not field-consistent — see §4. ARCHITECTURE.md §4 is a *third*, hand-maintained description that also diverges.
3. **Several consumed fields are undocumented and/or optional-by-accident**, meaning a conformant producer following inspect.md can emit JSON that the official consumer renders incorrectly (e.g. the `review` column).

Beacon can absolutely *reach* publishable stability — it is close — but publishing the schema **as-is** and inviting tooling would lock in current inconsistencies as a contract. Fix the §6 blockers first, then publish per §7-8.

A defensible **intermediate step** the ROADMAP already half-anticipates (line 101): commit `references/audit-results.schema.json` as a **descriptive, internal** schema (status: draft, not advertised as a third-party contract) — this is safe and useful now. Inviting external tooling is the step to gate.

---

## 2. Method

- Producer side: `commands/inspect.md` Step 6 (inspect.md:435-508) is the instruction the auditing agent follows to *emit* the JSON. Also Step 2a-2 / 2b / 2c add fields (`bot_protected`, `confidence_level`, `requires_live_audit`).
- Consumer side: `scripts/generate-report.mjs` is the only in-repo consumer. Every property access was enumerated by reading lines 30-71, 262-337, 412-421, 1101-1233, 1310-1330.
- Cross-check: ARCHITECTURE.md §4 (lines 188-269) is a TypeScript-flavoured description; treated as a *claim about* the schema, not the schema itself.
- Best-practice research: JSON Schema spec + standard schema-versioning guidance, cited inline in §7.

Every schema claim below carries a `file:line`. Best-practice claims carry a URL.

---

## 3. Reconstructed schema as currently emitted

This is the union of what inspect.md Step 6 instructs and what generate-report.mjs reads. Notation: `R` = required for the consumer not to break/misrender, `O` = optional, `O!` = optional but consumed (silent-misrender risk if omitted), `U` = undocumented in inspect.md Step 6 but consumed by the script.

### `metadata` — object, **R**

| Field | Type | Status | Evidence |
|---|---|---|---|
| `date` | string `YYYY-MM-DD` | O (defaults `'N/A'` / `'latest'`) | consumed generate-report.mjs:68, :1103; emitted inspect.md:442 |
| `url` | string | O | consumed for slug generate-report.mjs:41-56; **never shown in inspect.md:439-450 example** — U |
| `scope` | string | O! (defaults `'N/A'`; also slug fallback + `<title>`) | generate-report.mjs:57, :616, :1104; emitted inspect.md:443 |
| `standard` | string | O (defaults `'WCAG 2.2 AA'`) | generate-report.mjs:1105; emitted inspect.md:444 |
| `jurisdictions` | string[] | O (not consumed by script at all) | emitted inspect.md:445; no read in generate-report.mjs |
| `platform` | string | O (not consumed) | emitted inspect.md:446 |
| `tool_version` | string | O (not consumed) | emitted inspect.md:447 |
| `confidence_level` | `"high"\|"medium"\|"low"` | O! (defaults `'medium'`) | consumed generate-report.mjs:414; emitted inspect.md:448; mandated by inspect.md:203 |
| `requires_live_audit` | boolean | O (not consumed) | emitted inspect.md:449; mandated by inspect.md:201 |
| `audit_tier` | string | O! (defaults `'Tier 1 (static HTML only)'`) | consumed generate-report.mjs:413; **not in inspect.md Step 6 example** — U |
| `audit_methods` | string[] | O! (defaults `[]`) | consumed generate-report.mjs:415-421; **not in Step 6 example** — U |
| `bot_protected` | boolean | O (not consumed) | inspect.md:179, :182 instruct emitting it; no consumer |
| `unable_to_fetch` | boolean | O (not consumed) | inspect.md:179; no consumer |

**Note**: `confidence_level` is the only field with a closed enum that is *operationally load-bearing* (it caps score at 60 per inspect.md:201). It is still `O!` in the consumer — the script silently defaults it. That mismatch (mandated by producer, defaulted by consumer) is exactly the kind of thing a schema must pin down.

### `summary` — object, **R** (script does unguarded `audit.summary.overall_score`, generate-report.mjs:1112 etc.)

| Field | Type | Status | Evidence |
|---|---|---|---|
| `overall_score` | number 0-100 | **R** (unguarded access) | generate-report.mjs:1112, :1134, :1143, :1147 |
| `total_findings` | number | **R** (unguarded) | generate-report.mjs:1126, :1147 |
| `critical` | number | **R** (unguarded) | generate-report.mjs:1148 |
| `warnings` | number | **R** (unguarded) | generate-report.mjs:1148 — note **plural** key |
| `tips` | number | **R** (unguarded) | generate-report.mjs:1148 — note **plural** key |
| `unverifiable` | number | O (not consumed) | emitted inspect.md:457 |
| `pedagogical_excluded` | number | O (not consumed) | emitted inspect.md:458 |
| `categories` | array | **R** (unguarded `.map`) | generate-report.mjs:1135, :1178 |

Naming inconsistency worth flagging: `summary.critical` is singular but `summary.warnings`/`summary.tips` are plural (inspect.md:454-456, consumed generate-report.mjs:1148). A schema freezes this — fine, but it should be a *deliberate* freeze, not an accident.

### `summary.categories[]` — object, **R** per element

| Field | Type | Status | Evidence |
|---|---|---|---|
| `id` | string | **R** (used as join key + I18N lookup) | generate-report.mjs:229-233, :269, :1136, :1183-1186 |
| `name` | string | O! (fallback display when `id` unknown to I18N) | generate-report.mjs:231-232 |
| `score` | number 0-100 | **R** (unguarded in ring math) | generate-report.mjs:276, :1137, :1312 |
| `pass` | number | **R** (rendered directly) | generate-report.mjs:271 |
| `fail` | number | **R** (rendered directly) | generate-report.mjs:272 |
| `review` | number | **O! — undocumented** | consumed generate-report.mjs:273 (`cat.review \|\| 0`); **NOT in inspect.md Step 6 example, which emits `unverifiable` instead** (inspect.md:460-461) |
| `unverifiable` | number | O (not consumed at category level) | emitted inspect.md:460-461 |
| `weight` | number | O (not consumed) | ARCHITECTURE.md:225 claims it; inspect.md weights live in prose table inspect.md:401-412, not JSON |
| `note` | string | O (not consumed) | ARCHITECTURE.md:226 only |

**This is the clearest producer/consumer drift in the codebase.** The consumer renders a "Review" column from `cat.review` (generate-report.mjs:99 `th_review`, :273). The producer instruction (inspect.md:460) emits `unverifiable` at category level and never mentions `review`. A producer that follows inspect.md faithfully will always show `0` in the Review column. ARCHITECTURE.md:225 calls `review` a "legacy field" — confirming this is unresolved historical drift, not design.

### `findings[]` — array, **O** (`audit.findings?.` optional-chained throughout, e.g. generate-report.mjs:1186)

| Field | Type | Status | Evidence |
|---|---|---|---|
| `id` | string | O (not consumed) | emitted inspect.md:466 |
| `category` | string (joins `categories[].id`) | **R for grouping** | filter key generate-report.mjs:1186 |
| `severity` | `"critical"\|"warning"\|"tip"` | **R** (drives filter + styling) | generate-report.mjs:288-289, :1194-1200 — note finding key is singular `warning`, summary key is `warnings` |
| `title` | string | O! (defaults `''`) | generate-report.mjs:294 |
| `wcag` | string | O (defaults `''`) | generate-report.mjs:295 |
| `level` | string | O (defaults `''`) | generate-report.mjs:296 |
| `affected_users` | string | O (defaults `'N/A'`) | generate-report.mjs:299 |
| `location` | string | O (defaults `'N/A'`) | generate-report.mjs:300 |
| `description` | string | O (defaults `''`) | generate-report.mjs:301 |
| `fix` | string | O (block omitted if absent) | generate-report.mjs:302 |
| `legal_exposure` | string | O | generate-report.mjs:303 |
| `code_before` | string | O (gates the diff block) | generate-report.mjs:304 |
| `code_after` | string | O (defaults `''`) | generate-report.mjs:304 |
| `axe_node_count` | number\|string | O (not consumed) | ARCHITECTURE.md:243 only — **never read, never in inspect.md** |

### `legal_risk` — object, **O** (`buildLegalRiskHTML` returns `''` if absent, generate-report.mjs:315)

| Field | Type | Status | Evidence |
|---|---|---|---|
| `overall_level` | `"critical"\|"high"\|"medium"\|"low"` | **R if `legal_risk` present** (unguarded `.toUpperCase()` generate-report.mjs:333) | inspect.md:483 |
| `overall_score` | number 1-10 | **R if present** (rendered) | generate-report.mjs:333 |
| `narrative` | string | O (not consumed) | ARCHITECTURE.md:251 only |
| `jurisdictions` | array | **R if present** (unguarded `.map` generate-report.mjs:320) | inspect.md:484 |

`legal_risk.jurisdictions[]`:

| Field | Type | Status | Evidence |
|---|---|---|---|
| `name` | string | O! (defaults `''`) | generate-report.mjs:324 |
| `law` | string | O! (defaults `''`) | generate-report.mjs:326 |
| `risk_level` | `"critical"\|"high"\|"medium"\|"low"` | O! (`(j.risk_level\|\|'').toUpperCase()`) | generate-report.mjs:324-325 |
| `score` | number 1-10 | **R** (rendered raw `${j.score}/10`) | generate-report.mjs:328 |
| `detail` | string | O (defaults `''`) | generate-report.mjs:326 |
| `deadline` | string\|null | O (gates a line) | generate-report.mjs:327; inspect.md:490 shows `null` |

### `remediation[]` — array, **O** (`audit.remediation?.filter`, generate-report.mjs:1217)

| Field | Type | Status | Evidence |
|---|---|---|---|
| `priority` | `"p0"\|"p1"\|"p2"\|"p3"` | **R for grouping** | generate-report.mjs:1216-1217 — **note: script only renders `p0/p1/p2`; `p3` is silently dropped** (loop array generate-report.mjs:1216). ARCHITECTURE.md:260 lists `p3` as valid. |
| `title` | string | O! (defaults `''`) | generate-report.mjs:1225 |
| `wcag` | string | O (defaults `''`) | generate-report.mjs:1225 |
| `effort` | string | O (defaults `''`) | generate-report.mjs:1226 |
| `impact` | string | O (not consumed) | ARCHITECTURE.md:263 only |

### `testing_recommendations` — string[], **O** | generate-report.mjs:1233; inspect.md:503

### Fields claimed by ARCHITECTURE.md but neither emitted by inspect.md nor consumed

`site_signals` (ARCHITECTURE.md:204), `aeo_signals` incl. `aeo_subscore` / `schema_org_jsonld` (ARCHITECTURE.md:205-208), `screenshots[]` (ARCHITECTURE.md:266), `dark_mode_analysis` (ARCHITECTURE.md:268). The AEO sub-score is rendered as a *disclaimer block* (generate-report.mjs:378-410, :1185) but the **number itself is never read from JSON** — `buildAeoDisclaimer()` takes no arguments. So `aeo_signals` is currently a phantom: ARCHITECTURE says it exists, nothing produces or consumes it. This is precisely the under-specification a published schema must not inherit.

---

## 4. Stability assessment — what is stable vs what will churn

### Stable (safe to freeze)
- **`summary` core counters** (`overall_score`, `total_findings`, `critical`, `warnings`, `tips`) — the heart of any dashboard, unchanged in concept across 2.0.x, hard-required by the consumer. A dashboard aggregator only strictly needs these five plus `metadata.date`.
- **`summary.categories[]` `{id, score, pass, fail}`** — the 10-category model and weights have converged (ARCHITECTURE.md:164-168 calls weights "currently"; the category *ids* are stable).
- **`findings[]` `{category, severity, wcag, level}`** — the three-state severity model is an explicit architecture decision (ARCHITECTURE.md §6b) unlikely to change.
- **`severity` enum** `critical|warning|tip` and **`confidence_level` enum** `high|medium|low` — both pinned by the severity matrix (inspect.md:368-392) and confidence table (inspect.md:197-201).

### Likely to churn (do NOT invite tooling to depend on)
- **`aeo_signals` / AEO sub-score** — ROADMAP:55, :106 explicitly flag AEO sub-score as undocumented and slated to "become a separate, explicit metric with its own tab" in v2.1/v2.2. Its JSON shape is unwritten. Any aggregator keying on AEO would break at v2.1.
- **`legal_risk` risk-level vocabulary** — ROADMAP:48 plans to remap the uppercase `HIGH/MEDIUM` badge to "Higher exposure / Notable exposure / …". If the *enum values* (not just display) change, every legal-risk consumer breaks.
- **`summary.categories[].review` vs `unverifiable`** — actively inconsistent today (§3). Will be touched the moment anyone notices the empty Review column.
- **`remediation[].priority` p3** — accepted by the documented schema, dropped by the renderer. Unresolved.
- **`metadata.audit_methods` / `audit_tier`** — consumed but undocumented; format is free-text and unstable.
- **Category `weight`** — ARCHITECTURE.md:225 claims it in JSON, but weights actually live in inspect.md prose (inspect.md:401-412). If they migrate into JSON, that is a schema addition.

### Under-specified (neither stable nor churning — simply unwritten)
`site_signals`, `dark_mode_analysis`, `screenshots[]` — declared `object` / free-form in ARCHITECTURE.md:204,266,268. Free-form objects cannot be in a published contract; either specify them or mark them explicitly `additionalProperties: true` extension points.

### Cross-version churn evidence
The repo keeps no schema changelog, so churn is inferred not measured. ROADMAP's "Recently shipped" table (ROADMAP.md:24-31) shows 2.0.3-2.0.8 touched only the *HTML report* (escaping, i18n, tone, theme) — **no row mentions the JSON schema**. That is mildly reassuring: the data shape was not deliberately changed in the last six patches. But "not deliberately changed" plus "no version field" plus "three out-of-sync descriptions" is not the same as "stable contract".

---

## 5. What CI / dashboard consumers actually need

A CI gate (fail-the-build-if-score-dropped) and a dashboard aggregator (trend lines across audits) have a small, well-understood set of requirements. Industry guidance on data contracts converges on these:

1. **A version discriminator in the payload.** Consumers must branch on schema version without sniffing field presence. JSON Schema's own guidance is to carry a version and use it; see the JSON Schema docs on `$id`/versioning at <https://json-schema.org/understanding-json-schema/structuring> and the structuring guide at <https://json-schema.org/learn/getting-started-step-by-step>.
2. **A machine-readable schema document** they can validate against in their own pipeline (so a malformed Beacon output fails fast, not silently). JSON Schema draft 2020-12 is the current dialect: <https://json-schema.org/specification>.
3. **A stability/compatibility promise** — specifically *additive-only* evolution within a major version. Confluent's schema-evolution docs are the canonical statement of backward/forward compatibility rules for data schemas: <https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html>.
4. **Required vs optional drawn explicitly.** Today the only way to know `summary.overall_score` is required is to notice the consumer does an unguarded access (generate-report.mjs:1112). A consumer cannot reverse-engineer requiredness safely.
5. **Closed enums marked closed.** `severity`, `confidence_level`, `priority`, `risk_level` are effectively enums; a published schema must say so or a dashboard's colour mapping silently fails on a new value.

The current schema satisfies **none** of 1-5 in machine-readable form. It satisfies 4 and 5 *implicitly* in code, which is exactly the fragility a published schema removes.

---

## 6. Blockers — what must stabilise before inviting third-party tooling

In priority order. Each is phrased as a precondition, not a prescription of how to fix.

- **B1 (blocking). Add a `schema_version` field** to the top level (or `metadata`). Without a discriminator there is no safe contract. Suggest a string like `"1.0"`, independent of `plugin.json` `version`.
- **B2 (blocking). Reconcile the three schema authorities.** inspect.md Step 6, generate-report.mjs, and ARCHITECTURE.md §4 must agree. The `categories[].review` vs `unverifiable` split (§3) and the phantom `aeo_signals` are the concrete defects. Pick one source of truth — a committed JSON Schema doc — and make the other two reference it.
- **B3 (blocking). Resolve `categories[].review`/`unverifiable`.** Decide which key carries the unverifiable count and make producer + consumer match. Until then the Review column is contractually broken.
- **B4 (high). Pin required vs optional.** At minimum mark `summary.{overall_score,total_findings,critical,warnings,tips,categories}` and `categories[].{id,score,pass,fail}` required — these are the unguarded accesses.
- **B5 (high). Decide AEO's fate before publishing.** ROADMAP:106 already plans to restructure the AEO sub-score. Either exclude `aeo_signals` from v1.0 of the schema entirely, or specify it now. Publishing it half-formed guarantees a breaking change.
- **B6 (medium). Freeze or namespace free-form objects.** `site_signals`, `dark_mode_analysis`, `screenshots[]` — either specify them or declare them explicit extension points.
- **B7 (medium). Decide `remediation[].priority` `p3`.** Either the renderer handles it or the schema enum drops it.
- **B8 (low). Naming consistency call.** `summary.warnings` (plural) vs `finding.severity:"warning"` (singular); `summary.critical` (singular) vs `warnings`/`tips` (plural). Cannot be changed without a breaking bump — so decide *now*, before v1.0 freezes it.

B1-B3 are genuinely blocking. B4-B5 are strongly advised before any external announcement. B6-B8 can ship in v1.0 as long as they are *decided* (a documented quirk is fine; an undocumented one is not).

---

## 7. Best practice — publishing and versioning a data schema

### 7a. Publish as JSON Schema draft 2020-12
2020-12 is the current published dialect of JSON Schema (<https://json-schema.org/specification>). Declare the dialect with `$schema` and give the document a stable `$id` URL (<https://json-schema.org/understanding-json-schema/structuring>). The `$id` should be a permanent, dereferenceable URL — e.g. under the repo's GitHub Pages or raw URL — so validators and IDEs can fetch it.

### 7b. Version the schema independently of the plugin
The ROADMAP question explicitly asks for this, and it is correct practice. The plugin version (`plugin.json` `version`, currently `2.0.9`) tracks *software* releases; the data schema changes far less often. Coupling them forces a schema "version bump" on every unrelated patch and lies to consumers about compatibility. Carry a separate `schema_version` inside the payload **and** encode it in the schema's `$id` path (e.g. `.../schema/v1/audit-results.schema.json`). This is the standard pattern — OpenAPI, JSON-LD contexts, and Kubernetes API groups all version the contract separately from the implementation.

### 7c. Apply semver semantics to the schema
Treat the schema as semver where the *consumer* is the dependant (this is the SchemaVer / data-contract reading; see Snowplow's SchemaVer model <https://docs.snowplow.io/docs/api-reference/iglu/common-architecture/schemaver/> and Confluent's compatibility rules <https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html>):
- **MAJOR** — a breaking change: removing a field, renaming a field, narrowing a type, adding a value to a *closed* enum that consumers switch on, or making an optional field required. Consumers must update.
- **MINOR** — additive, backward-compatible: a new *optional* field, a new optional object. Old consumers keep working.
- **PATCH** — clarifications with no shape change: description edits, tightening docs.

### 7d. Additive-only within a major version
The single most important rule for keeping third-party tooling alive: **within `v1.x`, only ever add optional fields; never remove, rename, or retype.** This is the core of backward compatibility in every schema-registry system (Confluent's `BACKWARD` compatibility mode, <https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html>). Set `additionalProperties` thoughtfully: at the *root* keep it open (`true` or unset) so producers can experiment without a major bump; on *closed sub-objects* you may set `false`, but that itself is a compatibility-affecting choice.

### 7e. Provide migration notes and a schema changelog
A `SCHEMA-CHANGELOG.md` mapping each `schema_version` to the changes, plus a deprecation policy (mark a field deprecated for one major version before removal). JSON Schema has no built-in `deprecated`-with-teeth, but the `deprecated` annotation keyword exists (2020-12, <https://json-schema.org/draft/2020-12/json-schema-validation#name-deprecated>) and tooling/IDEs surface it.

### 7f. Ship validation in CI
Once published, Beacon's own CI should validate every generated `audit-results.json` against the schema (e.g. with `ajv`). This makes the schema a *tested* contract, not a stale doc — the failure mode of B2 (drift) is structurally prevented.

---

## 8. Draft skeleton — JSON Schema document

A starting skeleton is written to `drafts/q10-audit-results.schema.json`. It is **draft 2020-12**, encodes `schema_version` as required, marks the §6-B4 fields required, and pins the closed enums. It deliberately **omits `aeo_signals`** (per B5) and marks `site_signals` / `dark_mode_analysis` / `screenshots` as explicit extension points pending B6. It is a skeleton: every blocker in §6 must be resolved before it becomes a contract. It is NOT a change to the live schema — generate-report.mjs and inspect.md are untouched.

### Suggested versioning policy (one paragraph, ready to drop into a doc)

> Beacon's `audit-results.json` follows a schema version (`schema_version`) that is independent of the plugin version. The schema is published as a JSON Schema (draft 2020-12) at a stable `$id`. Within a major version, evolution is additive-only: new fields are optional, existing fields are never removed, renamed, or retyped, and no value is added to a consumer-facing closed enum. Breaking changes increment the major version and ship with migration notes in `SCHEMA-CHANGELOG.md`. A field is marked `deprecated` for at least one full major version before removal. Beacon's CI validates every generated audit file against the published schema, so producer and consumer cannot silently drift.

---

## 9. Recommendation summary

| Action | Verdict |
|---|---|
| Encourage third-party CI integrations / dashboard aggregators **now** | **No** — B1-B3 are blocking |
| Commit `references/audit-results.schema.json` as an **internal, draft** descriptive schema | **Yes, safe now** — and it forces B2/B3 into the open |
| Add `schema_version` field | **Do first** (B1) |
| Publish schema + invite external tooling | **After** B1-B5 resolved; then follow §7-8 |

The schema is *close*. The conceptual model (three-state verdict, 10 categories, severity enum) is sound and stable. What is missing is not design maturity but **contract discipline**: a version field, a single source of truth, and an explicit required/optional/enum specification. Those are a few hours of work, not a redesign — but they must precede, not follow, any invitation to third-party tooling. Publishing first and stabilising later would convert today's internal inconsistencies into externally-observed breaking changes.
