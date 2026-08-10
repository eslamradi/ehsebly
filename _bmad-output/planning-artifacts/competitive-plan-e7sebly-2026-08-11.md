# Competing with E7sebly — plan, 2026-08-11

## 0. The situation, stated plainly

E7sebly is the same product, under the same name, nine months ahead.

| | E7sebly | asemly |
|---|---|---|
| Live since | 29 Nov 2025 (iOS), Play updated 18 Jun 2026 | not released |
| Traction | **10,000+ installs, 81 reviews, 4.8★** | 42 extractions, 7/day, closed testing |
| Platforms | iOS + Android | Android only, no iOS bundle ID |
| Developer | Daniel Sherif | Eslam Radi |

"احسبلي" transliterated two ways. Same category, same country, same dark-with-green
palette.

**Their moat is distribution, not features.** Every feature gap below is a week of
work; 10,000 installs is not. Any plan that only closes feature gaps loses.

---

## 1. Phase 0 — the name — DONE, 2026-08-11

Renamed **ehsebly → asemly** (قاسملي, "split it for me").

Why the old name could not ship: `ehsebly` and `e7sebly` are the same word,
احسبلي, transliterated two ways. Worse, the `e7seb` stem is contested by more
than one party — `E7seb` (Meena Emad Shafik Ishak, Finance, Jun 2026) opens its
own store description with "e7sebly (احسبلي)". Any name on the ح-س-ب root walks
into a crowd.

`asemly` moves to a different root entirely, ق-س-م (to divide), keeps the
colloquial `-ly` ending that makes the name sound native, and says the more
accurate verb: split, not calculate. Verified clear on the Egypt App Store;
Play still to be confirmed.

Rejected along the way, with reasons worth keeping:

- `e7sebha` — 71% string similarity to the competitor, differing only in the
  last two letters. Reads as a knockoff, and your own reels would send people
  to their listing
- `hesba` / `7esba` — the right word, but taken twice on the App Store and
  three times on Play, all Finance, all Egypt
- `wasl`, `sofra`, `tarabeza`, `taqseem` — the literal vocabulary for receipts
  and tables is already occupied
- `2asemly` — correct Egyptian pronunciation, but a digit in a name breaks the
  channel that matters: nobody can say it aloud in a reel

Consequences now in flight:

- Android `applicationId` is `com.downdev.asemly`. Package segments cannot
  begin with a digit, which is what ruled out `com.downdev.2asemly`
- **A new applicationId is a new app on Play.** The closed-testing listing under
  `com.downdev.ehsebly` cannot be renamed and is abandoned. versionCode restarts
  at 1
- The domain move to `asemly.eslamradi.com` needs a DNS record that the stored
  Cloudflare token cannot write. Until it exists, the site stays on the old
  domain with the new brand

## 2. Phase 1 — table stakes (what blocks a credible launch)

### 2.1 Merchant name — the cheapest high-value item on this list

Their history reads "Unknown place" on **every** bill. Three entries, all
identical but for the amount. Their history is unbrowsable.

**We have the same gap** — the extraction schema has no merchant field.

- Add `merchant_name` to the Worker's `extract_receipt` tool schema, transcribe-only
- Thread through `toExtractionResult` → session → history
- Show it as the history row title, falling back to the date
- Update `verifyExtraction.ts`

Effort: ~half a day. Beats them at the thing their own users see most.

### 2.2 Tips

They have it, we don't. `ChargesLedger` now makes this a fifth `ChargeRow` plus a
field in `TaxServiceSettings` and `calculateSplitTotals`. Egypt tips are usually
cash and off-receipt, so it belongs as an *optional* row, off by default.

Effort: ~half a day.

### 2.3 Multi-currency — defer unless expanding

`money.ts` is EGP-integer-piastres end to end (AD-3). Making it multi-currency
touches parsing, formatting, storage and the Worker. Only worth it if leaving
Egypt. **Recommend: skip for now**, and treat "built for Egyptian receipts" as
positioning rather than a limitation.

### 2.4 Social sign-in — defer until Groups ships

Email OTP is more friction than Google/Apple, but it only matters on the Groups
path, which is hidden. Revisit with Phase 2.

---

## 3. Phase 2 — the actual wedge (where we are genuinely better)

### 3.1 Ship Groups — biggest asymmetry in our favour

Their "Groups" is a local roster: a colour, an icon, typed member names. **No
sync, no invites, no who-owes-whom.** Ours is a real shared ledger with email
invites, expenses over time, and settle-up.

Blocked on one thing, already documented: the **commit sheet**. Deleting Review
removed the deliberate press before the group ledger write, so `FinalSplitScreen`
posts on arrival. Build the sheet, then flip `GROUPS_ENABLED`.

- [ ] Commit sheet on the assignment screen
- [ ] Flip the flag, restore the Home card
- [ ] Restore the Groups section on the landing page

Effort: 1–2 days. Turns their headline feature into our advantage.

### 3.2 Lead with reconciliation

Nothing in their listing or screens suggests they check the computed total against
the printed one. We do, we show it, and it is the feature that earns trust with
someone's money. Today it is a quiet pill on the final screen.

- [ ] Make "Matches receipt" prominent, not incidental
- [ ] Put it in the store screenshots and the first line of the listing
- [ ] Say the number: "checked against the printed total, to the piastre"

### 3.3 Market multi-photo

Long paper receipts shot in pieces, and delivery-app screenshots. Up to 8 images
per extraction. Unseen in their flow. Costs nothing to promote — it already works.

---

## 4. Phase 3 — their reviews are our roadmap

Two requests sit unanswered in their Play reviews:

1. **Cash tendered → change owed.** "Why can I not enter the amount I paid and have
   the app tell me how much change I should receive." Nobody has built it. Small
   feature, concrete daily annoyance.
2. **The office wedge.** A reviewer described splitting group food orders with
   bundles and offers, previously on A3 paper. Recurring, higher-frequency, and
   more painful than a restaurant table. Worth aiming at deliberately.

---

## 5. Phase 4 — distribution, which is what actually decides this

We know their channel, from their own reviews: *"i saw reel about it and installed
it."* **Short-form video is how they got 10,000 installs.** Not ASO, not ads.

- [ ] One reel of the real loop: photo → items read → tap who had what → done.
      The product demos itself in fifteen seconds
- [ ] Aim the message at the fronter who always pays and chases everyone after
- [ ] The office/bundle scenario as its own video
- [ ] ASO once the name is settled: title, short description, screenshots showing
      the reconciliation badge

**iOS** is real work, not a build profile: Apple Developer account, bundle
identifier, provisioning, listing, review. Half their platform reach. Schedule it
after the name decision so it isn't done twice.

---

## 6. Phase 5 — monetisation

Their "Offers & Partners" occupies prime home-screen real estate with a
placeholder: "Something Exciting Is Coming." Announced, not shipped.

Two options, and they are opposites:

- **Beat them to it** — restaurant partner offers, same model, executed first
- **Refuse it deliberately** — no ads, no partner deals, no tracking, and say so.
  Our privacy policy already names every processor by name; theirs declares "no
  data shared with third parties" while collecting photos

The second is more defensible for a personal project and harder for them to copy
once their partner deals ship.

---

## 7. If you only do three things

1. **Settle the name.** Everything else is wasted motion until it is decided.
2. **Ship Groups with the commit sheet.** Their roster versus our ledger is the one
   place we are not catching up — we are ahead.
3. **Make one reel.** It is how they got their users, they told us so, and we have
   nothing that reaches anybody.

---

## 8. What this plan does not claim

- Feature parity does not win this. They have nine months and 10,000 users
- Their extraction accuracy is **untested**. The four screenshots reviewed were
  home, history, groups and profile — not the scan-to-result loop. Their reading
  quality could be better or worse than ours; we do not know
- Multi-currency, iOS and social sign-in are each real projects, deliberately
  deferred above rather than dropped
