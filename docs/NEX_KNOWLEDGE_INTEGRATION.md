# Nex website learning and Ask Nex page

## Public visitor experience

The dedicated Q&A and AI transparency page is `/ask-nex` (static file `ask-nex.html`). The `message` query parameter supports a shareable prefilled question: `/ask-nex?message=Do%20you%20offer%20wheelchair%20transportation%3F`. Questions are posted to the existing public visitor assistant endpoint. No staff/admin token is sent from this page.

The page explicitly states that AI responses may be incomplete, that medical emergencies must go to 911, that live bookings are not confirmed here, and that sensitive patient details should not be entered.

## Knowledge update review workflow

1. Run `node scripts/nex-knowledge-sync.cjs` against the published Nexus website to collect FAQPage structured data from seven allowlisted service/accessibility pages. This produces `docs/nex-knowledge-candidates.json` for review. Network access is required.
2. Review each candidate's text against the actual website and published operating policies. Exclude misleading, duplicate, outdated, clinical advice, pricing commitments, and privacy-sensitive information.
3. Copy only explicitly approved entries into `netlify/functions/_shared/nex-approved-knowledge.json` (an array, initially empty). Set `review_status: "approved"`, `approved_by` and an ISO timestamp `approved_at` for each verified entry. Do not edit IDs, questions, sources, or answers without review.
4. Open a pull request; have an authorized owner review the exact approved answers; run `node --test tests/nex-approved-knowledge.test.cjs` and existing `tests/visitor-assistant.test.cjs` before merging.
5. After release, test both original and newly approved questions on `/ask-nex`. Confirm emergency behavior, pricing guardrails, and linked source pages.

Only `nex-approved-knowledge.json` is imported by the assistant. Candidate output has no runtime effect. This design deliberately does **not** allow a public site change or crawler result to automatically alter live assistant answers. An approval dashboard and scheduled crawl are future enhancements.

## Operational constraints

- Only the public service/accessibility allowlist may supply supplemental answers.
- Never publish credentials, private documents, patient information, dispatcher details, contact numbers other than the already approved public ones, or unverified fares.
- Public Nex is not a HIPAA patient intake channel. Redirect sensitive details to authorized Nexus workflows.
- Audit and version approvals through GitHub changes; roll back problematic entries by reverting the approval commit.
