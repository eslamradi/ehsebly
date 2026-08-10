# Play Console — Store Listing Copy

Paste directly into Play Console's "Main store listing" fields.

## App name (max 30 chars)
asemly — Receipt Breakdown

## Short description (max 80 chars)
Break down a restaurant bill in a few taps — Egypt's tax math done right.

## Full description (max 4000 chars)

asemly reads your receipt and tells you exactly who owes what — including the one calculation a quick mental tally always gets wrong: 14% tax compounding on top of 12% service, not the raw subtotal.

HOW IT WORKS
Photograph the bill, tap through who had what, and asemly does the math. It shows you the printed total right alongside its own computed total, so you can catch a misread price before relying on it.

TWO WAYS TO USE IT

Casual Breakdown — no sign-up, no account. Snap a receipt, assign items, get each person's exact share. Nothing is saved anywhere except your own device.

Groups — for a running household or an ongoing trip. Invite people by email, log expenses over time, and see a shared, synced ledger of who owes whom.

WHAT EHSEBLY DOESN'T DO
No in-app payments. asemly never moves, holds, or has access to your money — it computes a number, and you settle up however you already do (InstaPay, Vodafone Cash, cash, bank transfer). No ads, no analytics or tracking SDKs, no selling your data.

Currently in closed testing with a limited group of testers.

## Privacy Policy URL
https://ehsebly.pages.dev/privacy.html
(swap to https://ehsebly.eslamradi.com/privacy.html once the custom domain's DNS record is live)

## Category
Finance (or Tools — either is defensible; Finance is more discoverable once this goes public)

## Contact email
hi@eslamradi.com

---

# Data Safety form — answers

Based on what's actually in privacy.html. Fill in Play Console's Data Safety questionnaire with these:

**Does your app collect or share any of the required user data types?** Yes

| Data type | Collected? | Shared? | Purpose |
|---|---|---|---|
| Email address | Yes | No | Account management (sign-in) |
| Name | Yes | No | App functionality (display name in groups) |
| Photos (receipt images) | Yes, but not stored — forwarded to Anthropic for OCR only, never persisted server-side | Yes (Anthropic, for processing only) | App functionality |
| Financial info (expense/item amounts, who-paid/who-owes) | Yes (Groups only) | No | App functionality |

**Is data encrypted in transit?** Yes
**Can users request data deletion?** Yes (email hi@eslamradi.com)
**Is data collection required or optional?** Required for Groups; Casual Breakdown collects nothing server-side.

# Content rating questionnaire — guidance

- Category: Utility / Productivity / Finance tool
- No user-generated content shared publicly, no chat/messaging between strangers, no violence/sexual content/gambling
- Should land in "Everyone" / lowest rating tier across all major rating boards (ESRB Everyone, PEGI 3, etc.)

# Assets ready to upload

- Hi-res icon (512x512): `/Users/radi/side/asemly/play-store-icon-512.png`
- Screenshots: `/Users/radi/side/asemly/landing/assets/*.jpg` — ⚠️ some of these (step-*.jpg, final-split.jpg at 323x700) have an aspect ratio of ~2.17:1, which is right at or past Google's stated 2:1 max for screenshots. Play Console may reject them. Let me know if it does and I'll crop/pad them.
- Feature graphic (1024x500, required for production track, optional for closed testing): not yet created — say the word if/when you need it.
