---
title: hasebly PRD Addendum
created: 2026-07-16
updated: 2026-07-16
---

# Addendum: hasebly

Technical-how, rejected alternatives, and depth that informed the PRD but doesn't belong in it. For architecture and downstream implementation reference.

## Platform / Cross-Platform Framework

- Decision in PRD (§6.1): one app, one codebase, ships to both iOS and Android — not two native builds.
- Candidates to evaluate at architecture stage: React Native, Flutter, or a cross-platform-capable web/PWA approach. No preference stated by the founder; this PRD deliberately did not pick one (capability, not implementation).
- Consideration: whichever framework is chosen should have solid native camera access (FR-1) and be able to call out to whatever OCR service is selected (see below) without excessive glue code, given this is a solo-founder build.

## OCR Service Selection

- The OCR de-risking spike (see `prfaq-hasebly.md` coaching notes and `prfaq-hasebly-distillate.md`) validated *legibility* using a general-purpose vision-capable LLM reading receipt photos directly — this was a proxy, not the production service.
- Candidates not yet evaluated for cost/latency/accuracy at production scale: Google Cloud Vision, Azure Document Intelligence, a vision-capable LLM API (e.g., Claude, GPT-4V) called directly per scan, or an on-device OCR library (lower accuracy expected on Arabic/thermal receipts, but zero marginal per-scan cost).
- Cost risk already flagged in the PRFAQ Internal FAQ: cloud OCR calls cost money per scan; at 10-dinner-test volume this is trivially cheap, but the choice matters once/if the product scales past friends-only testing.
- Recommendation: pick the cheapest option that clears the spike's demonstrated bar (handles printed receipts, mixed Arabic/English, thermal paper) for v1; revisit if handwritten-tab support becomes a real requirement later.

## Tax/Service Compounding — Worked Reference

From the OCR spike, the confirmed real-world formula when both tax and service apply:

```
service = subtotal × service_rate
tax     = (subtotal + service) × tax_rate
total   = subtotal + service + tax
```

Verified against two independent real receipts:
- Greek Club Cairo: subtotal=184.00, service_rate=12% → service=22.08; tax_rate=14% on (184.00+22.08)=206.08 → tax=28.85; total=234.93. Matches printed total exactly.
- Unnamed French-menu restaurant (IMG_7852 in spike): net price=1266.00, 12% service=151.92; 14% tax on (1266.00+151.92)=1417.92 → tax=198.51; total=1616.43. Matches printed total exactly. (Note: label-to-value mapping on this specific receipt was genuinely hard to read on first pass due to rotation and thermal fade — the reconciliation-by-math approach, i.e. working backward from the printed total, is what resolved the ambiguity, which is itself a useful implementation pattern: when OCR confidence on individual tax/service line labels is low, cross-check candidate values against (printed total − subtotal) rather than trusting line labels alone.)

Counterexamples observed (service-only, no compounding question arises since there's only one rate):
- SEA SOUL Restaurant & Cafe (3 independent real orders, same venue): consistently 10% service, zero tax. No tax line at all — the "tax applicable" toggle should default to off if no tax line is detected, per FR-4.

## Non-Receipt / Off-Target Document Handling

Real-world spike sample (22 photos) included, mixed into the same camera roll:
- A card payment terminal (Geidea) slip — transaction confirmation only, no itemization.
- Three gym/pharmacy body-composition printouts (two different businesses, multiple visits) — health metrics (BMI, body fat %, calories), not commerce documents.
- A utility bill payment receipt.
- A food-delivery (Talabat) order receipt — this one *is* a real itemized receipt with VAT, but represents a delivery order rather than a physical dine-in group bill; worth deciding later whether hasebly should support this use case (no group physically present, no "who ordered what at the table" scenario) or explicitly exclude it.

None of these should crash or silently produce a nonsense split — FR-3 in the PRD covers the minimal "no plausible items found" fallback. A more sophisticated document-type classifier was explicitly scoped out as a non-goal for v1 (over-engineering for a friends-only test where the founder is deliberately photographing a fresh restaurant check, not scanning random camera-roll contents).

## Full-Vision Features Deferred Past v1 (design already exists, not re-derived here)

These are fully designed in `prfaq-hasebly.md` (press release + Customer FAQ) and intentionally excluded from the v1 PRD scope (§6.2). When the 10-dinner test passes, pull these directly from the PRFAQ rather than re-designing:
- **Anonymous ID + optional account linking** — auto-created random ID, zero visible sign-up flow, optional later linking to email/phone for cross-device history.
- **Local/synced split history** — tied to the anonymous ID, survives reinstall, syncs across devices once linked.
- **Ads** — post-split-completion placement only, not interleaved into the scan/confirm/assign flow, non-PII-based targeting tied to the anonymous ID.

## Handwritten Receipt Fallback

The one clear OCR failure case in the spike (a fully handwritten club/cabana tab, no printed structure). Not solved by this PRD — FR-3's fallback ("no items found, retry or enter manually") is the only handling planned for v1. If handwritten tabs turn out to be common enough during the 10-dinner test to matter, that's a signal to revisit, not something to design for preemptively.
