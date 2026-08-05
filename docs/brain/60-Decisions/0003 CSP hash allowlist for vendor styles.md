---
type: adr
title: ADR-0003 CSP hash allowlist for vendor-injected styles
status: accepted
phase: 1
date: 2026-08-03
---

> [!warning] HISTORICAL — the code this note described was deleted 2026-08-04
> Kept for its engineering lessons only. Nothing here describes running code.
> See [[60-Decisions/0006 Full rebuild from scratch|ADR-0006]].

# ADR-0003 — CSP hash allowlist for vendor-injected `<style>` (D-13)

**Context.** Spec §5.15/AC-33 kept `style-src 'self'` and asserted no source-installed
component injects `<style>`. But §1.2 mandates `sonner` (E15) and `vaul` (E14), which
inject stylesheets at module scope with no opt-out — under the spec's CSP both rendered
unstyled in production (invisible in dev: Vite serves the shell without helmet).

**Decision.** Allow exactly those sheets by **sha256 hash, derived at build time**
(`frontend/scripts/vendor-style-hashes.mjs` imports each package under a document shim,
captures injected CSS, emits `dist/vendor-style-hashes.json`). Server appends the
manifest entries to `style-src` and **fails closed** (fatal + non-zero exit) on a
missing/malformed manifest; the extractor exits non-zero if a package stops injecting.
No `unsafe-inline` anywhere. The empty-string hash is included (browser evaluates each
element once empty) and grants nothing.

**Consequences.** AC-33 amended to *"no unhashed injected `<style>`; allowlist closed,
derived, fail-closed."* The mechanism is strictly narrower than `'unsafe-inline'` and
drift-proof by construction. **Known gap closed in the fix round:** `react-remove-scroll-bar`
injects a *runtime* sheet (scrollbar-width-dependent bytes, unhashable) on modal open —
handled by the scroll-lock fix (see Phase Report), after which no runtime injector may
remain; the prod-CSP headless pass gained a modal-open interaction to prove it.

**Revisit when:** a dependency bump (rebuild re-derives); never hand-edit the manifest.
