# Play Console — Store Listing Copy

Paste directly into Play Console's "Main store listing" fields.

## App name (max 30 chars)
asemly: split the bill

## Short description (max 80 chars)
Split a restaurant bill in a few taps, with Egypt's tax math done right.

## Full description (max 4000 chars)

asemly reads your receipt and tells you exactly who owes what. That includes the part people get wrong in their heads: the 14% tax lands on top of the 12% service, not on the subtotal.

HOW IT WORKS
Photograph the bill, tap through who had what, and asemly does the math. It shows you the printed total right alongside its own computed total, so you can catch a misread price before relying on it.

NO SIGN-UP
There is no account and no login. Snap a receipt, assign the items, get each person's exact share. The finished breakdown is saved on your device and nowhere else.

WHAT ASEMLY DOESN'T DO
No in-app payments. asemly never moves, holds, or has access to your money. It computes a number, and you settle up however you already do: InstaPay, Vodafone Cash, cash, bank transfer. No ads, no analytics or tracking SDKs, no selling your data.

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
| Email address | Not in this release (Groups is disabled) | No | Account management (sign-in) |
| Name | Not in this release (Groups is disabled) | No | App functionality (display name in groups) |
| Photos (receipt images) | Yes, but not stored: forwarded for OCR only, never persisted server-side | Yes (Google for every receipt, Anthropic as fallback, processing only) | App functionality |
| Financial info (expense/item amounts, who-paid/who-owes) | Not in this release (Groups is disabled) | No | App functionality |

**Is data encrypted in transit?** Yes
**Can users request data deletion?** Yes (email hi@eslamradi.com)
**Is data collection required or optional?** Required for Groups; Casual Breakdown collects nothing server-side.

# Content rating questionnaire — guidance

- Category: Utility / Productivity / Finance tool
- No user-generated content shared publicly, no chat/messaging between strangers, no violence/sexual content/gambling
- Should land in "Everyone" / lowest rating tier across all major rating boards (ESRB Everyone, PEGI 3, etc.)

# Assets ready to upload

- Hi-res icon (512x512): `/Users/radi/side/ehsebly/play-store-icon-512.png`
- Screenshots: `/Users/radi/side/ehsebly/landing/assets/*.jpg` — ⚠️ some of these (step-*.jpg, final-split.jpg at 323x700) have an aspect ratio of ~2.17:1, which is right at or past Google's stated 2:1 max for screenshots. Play Console may reject them. Let me know if it does and I'll crop/pad them.
- Feature graphic (1024x500, required for production track, optional for closed testing): not yet created — say the word if/when you need it.
