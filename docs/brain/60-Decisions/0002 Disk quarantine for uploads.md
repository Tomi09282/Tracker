---
type: adr
title: ADR-0002 Disk quarantine for all uploads
status: accepted
phase: 1
date: 2026-08-03
---

> [!warning] HISTORICAL — the code this note described was deleted 2026-08-04
> Kept for its engineering lessons only. Nothing here describes running code.
> See [[60-Decisions/0006 Full rebuild from scratch|ADR-0006]].

# ADR-0002 — Disk quarantine for all uploads

**Context.** The skill's upload template uses `multer.memoryStorage()` blessed at a 5 MB
cap. Phase 1 needs 50 MB videos; at `tier:upload` (20 req/15 min/account), concurrent
50 MB buffers are a ~1 GB memory-DoS lever (SPEC-PVP K3).

**Decision.** ALL uploads stream to a disk quarantine (`storage/tmp`, `randomUUID` names,
gitignored, 1 h boot sweep). Magic-byte sniff from the tmp path; image byte-cap enforced
by `fs.stat` **before decode** (bytes never enter memory); sharp decodes from disk with
`limitInputPixels: 30M` (pixel-bomb bound); images re-encode to WebP (EXIF/GPS dropped);
videos move out via `storage.putFile` (COPYFILE_EXCL — never `rename`, which clobbers).
Sharp decode failures map to 400 + `upload.decode_failed`, never 500 (R2-2). Tmp file
unlinked in a route `finally` on every non-success path.

**Consequences.** Peak RSS is bounded by stream-buffer size regardless of concurrency;
one multer config (no pre-sniff storage branching, which multer cannot do anyway).
Recorded as a conscious deviation from the skill's memory template — strictly safer at
our cap. Crash leftovers are transient disk (R-8).

**Revisit when:** S3 driver lands (putFile becomes a streamed upload).
