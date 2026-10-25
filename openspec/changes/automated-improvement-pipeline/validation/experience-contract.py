"""Synthetic CLI integration probe; no model calls, owner decisions or real store.

Set YUME_REPO to a reviewed external checkout, then run this file with Python 3.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    repo = Path(os.environ["YUME_REPO"]).resolve()
    with tempfile.TemporaryDirectory(prefix="beacon-experience-") as tmp:
        root = Path(tmp)
        store = root / "store"
        events = []

        def cli(*args, expected=0):
            run = subprocess.run(
                [sys.executable, "-B", "-m", "akegarasu_no_yume", "--store", str(store), *args],
                cwd=repo, capture_output=True, text=True, timeout=30,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            )
            assert run.returncode == expected, (args[0], run.returncode, run.stdout, run.stderr)
            result = json.loads(run.stdout or run.stderr)
            events.append({"command": args[0], "exit": run.returncode})
            return result

        def save(name, value):
            path = root / name
            path.write_text(json.dumps(value), encoding="utf-8")
            return str(path)

        cli("init")
        cli("upgrade", "--to", "2")
        cli("upgrade", "--to", "3")
        evidence = root / "synthetic.txt"
        evidence.write_text("Synthetic scanner timed out on a generated input.\n", encoding="utf-8")
        writer = {"actor_type": "agent", "name": "synthetic-probe", "machine": "synthetic-host"}
        when = "2026-01-01T00:00:00+00:00"
        ref = {"id": "evr_beaconprobe0001", "source_revision": "local-digest", "locator_id": "synthetic-evidence", "availability": "available"}
        exp = {"schema_version": 1, "id": "exp_beaconprobe0001", "operation_id": "op_beacon-ingest", "created_at": when, "writer": writer,
               "kind": "experience", "scope_id": "beacon-synthetic", "event_time": when, "recorded_at": when,
               "summary": "Synthetic timeout evidence", "evidence_refs": [ref],
               "claims": [{"type": "observation", "text": "The synthetic fixture reports a timeout.", "evidence_ref_ids": [ref["id"]]}]}
        ingest = save("ingest.json", {"experiences": [exp], "local_map": {"synthetic-evidence": "synthetic.txt"}, "synthetic": True})
        first = cli("ingest", "--file", ingest)
        assert cli("ingest", "--file", ingest) == first
        question = "Which synthetic timeout needs a reproducer?"
        cli("prepare", "--auto-split", "--scope", "beacon-synthetic", "--question", question, "--operation-id", "op_beacon-prepare")
        claim = cli("dream", "begin", "--max", "1", "--actor-type", "agent", "--actor", "synthetic-probe")
        refused = cli("dream", "begin", expected=3)
        assert refused["error"] == "dream_in_progress"
        packet = claim["packets"][0]
        ref["source_revision"] = "sha256:" + hashlib.sha256(evidence.read_bytes()).hexdigest()
        dream = {"schema_version": 3, "id": "drm_beaconprobe0001", "operation_id": "op_beacon-dream", "created_at": when, "writer": writer,
                 "kind": "dream", "scope_id": "beacon-synthetic", "question": question,
                 "packet_id": packet["packet"]["id"], "claim_id": claim["claim_id"], "experience_ids": [exp["id"]],
                 "prior_lesson_ids": [], "outcome_ids": [], "disposition": "propose", "rationale": "A generated reproducer can isolate this synthetic timeout.",
                 "counterevidence": [], "limitations": ["Synthetic plumbing only; no fix or effectiveness proven."],
                 "model": None, "effort": None, "tokens": None, "duration_s": None,
                 "candidate": {"id": "lsn_beaconprobe0001", "scope_id": "beacon-synthetic", "target_id": "behavior:synthetic-timeout",
                               "target_revision": None, "statement": "Reproduce the timeout before changing the scanner.",
                               "applies_when": "A synthetic scanner timeout is observed.", "does_not_apply_when": "No timeout is observed.",
                               "suggested_action": "Build a bounded synthetic reproducer.", "revisit_when": "The reproducer contradicts the hypothesis.",
                               "evidence_refs": [ref], "supersedes_ids": []}}
        record = save("dream.json", dream)
        cli("record", "--file", record)
        cli("dream", "end", "--claim", claim["claim_id"], "--actor-type", "agent", "--actor", "synthetic-probe")
        pending = cli("status", "--pending")
        assert len(pending["candidates"]) == 1
        assert pending["candidates"][0]["offline_check"]["untested_against_history"] is True
        recall = cli("recall", "--scope", "beacon-synthetic", "--query", "timeout")
        assert recall["hits"] == [], "A proposal is not an accepted lesson"
        assert cli("prepare", "--auto-split", "--scope", "beacon-synthetic", "--question", question)["status"] == "no_new_material"
        evidence.write_text("Changed synthetic evidence.\n", encoding="utf-8")
        status = cli("status")
        assert status["unavailable_evidence"], "Changed evidence must be visible"
        print(json.dumps({"synthetic": True, "passed": ["ingest-replay", "claim-exclusion", "candidate-pending", "no-auto-acceptance", "no-new-material", "changed-evidence"], "events": events}))


if __name__ == "__main__":
    main()
