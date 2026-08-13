---
type: adr
title: ADR-0014 Payment processor — Stripe (Connect + Billing)
status: accepted
phase: 8
date: 2026-08-14
supersedes: D-2A ("payment processor LATER, stubs only")
---

# ADR-0014 — Payment processor: Stripe Connect + Billing

**Context.** D-2A locked "coaches pay a subscription; payment processor LATER, stubs only". Phase 8
lifts the *later*. Nothing about money exists in the schema yet — the coin ledger is an internal
currency under D-1A (earn-only, two rows), the store spends coins for entitlements, and there is no
subscription table and no seat-cap implementation. The payment layer is greenfield.

## The question that decided it

Not "which is cheapest". Three capabilities were on the Phase 8 list and they are not equals:

| | Status | Difficulty |
|---|---|---|
| Coach subscription (T8.2.2) | locked by D-2A — required | moderate |
| Coin top-up for real money (T8.2.4) | only if D-1A is lifted | easy, any processor |
| **Payout to coaches (T8.2.5)** | only if D-1A is lifted | **the one that decides everything** |

Money flowing OUT to third parties is what makes this a *platform*: it brings KYC onboarding of
coaches, AML obligations, payout scheduling and dispute handling. So the owner was asked the single
question that splits the field — **will money ever go out to coaches?** — and the answer was **yes,
that is the plan.**

## Decision

**Stripe, using Connect for the marketplace side and Billing for subscriptions.**

## What the "yes" ruled out, and why

**Merchant-of-Record providers (Paddle, Lemon Squeezy, FastSpring) are out.** They are genuinely
attractive for a solo developer — the MoR becomes the seller of record, so EU digital-services VAT,
invoicing and fraud are theirs, which is real administrative burden lifted for a higher fee. But an
MoR sells *your* product to *your* customer; it does not pay third parties. A marketplace that owes
its coaches money cannot be built on one. This is a capability wall, not a preference.

That leaves PSPs with platform support:

- **Stripe Connect** — chosen. Widest documentation, onboarding flows that carry the coaches' KYC,
  subscriptions and one-off in the same account, and the largest body of prior art for exactly this
  shape (platform charges a subscription, platform pays out sellers).
- **Mangopay** — a serious alternative and EU-native, built for marketplaces and regulated in the
  EU. Rejected on developer experience and documentation depth rather than on capability; for a
  solo developer the integration cost is the dominant risk, not the licensing model.
- **Adyen for Platforms** — capable and rejected on stage. It is built for volume this product does
  not have, with commercial terms to match.
- **Barion** (Hungarian) — good domestic coverage, but marketplace payout and cross-border EU reach
  are weaker than the product needs.

## Consequences, stated plainly because they are the cost of the "yes"

1. **The platform takes on coach onboarding.** Each coach who is to be paid must complete Stripe's
   identity/KYC flow before a payout can reach them. That is a product surface — a coach who has not
   finished it can earn and cannot be paid, and the UI has to say so rather than fail silently.
2. **EU VAT / OSS on the subscription revenue stays ours.** Stripe Tax can calculate; it does not
   file. This is the burden the MoR route would have removed, and it was traded away deliberately.
3. **Disputes and payout timing become ours.** A refunded client payment whose coach share has
   already been paid out is a negative balance somebody has to own.
4. **This is a regulated area.** The points above are engineering-planning notes, not tax or legal
   advice; the VAT registration and platform obligations need an accountant's confirmation before
   the first real charge.

## What this does NOT decide

- **D-1A stays as it is.** Coins remain earn-only. T8.2.4 (real-money top-up) and T8.2.5 (payout)
  are still gated behind lifting it; this ADR chooses the processor that makes lifting it possible,
  it does not lift it.
- **Pricing, tiers and the seat cap numbers** are product decisions, untouched here.

## The engineering rule that follows

**One interface, the way D-6A did it for media.** Every call into the processor goes through a
single module; routes never import the SDK. Not because a switch to Mangopay is expected — it is
not — but because the alternative is a processor's shapes leaking into thirty route handlers, and
because it is the only way the payment path can be tested without the network.

And the existing law applies without exception: money moves in **named worker transactions** with
guards inside the UPDATE, integer minor units, an idempotency key on every mutating endpoint, and
the 5-pass adversarial checklist (forge / replay / race / IDOR / extremes) before any endpoint is
called done. Inbound webhooks (T8.2.6) verify the raw body with a constant-time signature check,
defend replay on timestamp **and** event id, and verify *before* parsing.

> [!note] Tooling
> The Stripe MCP connector is present in this workspace but **not authorized**, so no live API
> access is available from a non-interactive session. It has to be authorized from an interactive
> `claude` session (`claude mcp` / `/mcp`). The integration can be written without it; only live
> calls and account inspection need it.
