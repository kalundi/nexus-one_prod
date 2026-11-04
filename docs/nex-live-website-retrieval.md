# Nex public website retrieval — live answering path

## The defect
Previously, the website watcher stored hashes and created administrator review notifications, but the assistant's public answering path only searched `visitor-knowledge.cjs` and manually approved FAQs. A question such as “Does Nexus have social media?” failed the FAQ confidence threshold and returned an unsupported-information response even though official Nexus channels were declared in the website's curated media sources.

## New answer routing
1. Emergency and private role-specific actions remain governed by their existing handlers and safeguards.
2. The approved curated FAQ and conversation memory are used first.
3. On an unsupported FAQ, Nex can recognize the official social channels from the site's editorial media catalog and Nexus-approved social identity references.
4. For other eligible public informational questions, Nex makes a bounded read-only request to a fixed allowlist of seven **public Nexus pages**, extracts visible short sections, and returns a match only when multiple topic terms overlap. A returned answer includes an explicit source URL.
5. If approved pages are unavailable or evidence is weak, Nex retains the honest “I don't know” fallback rather than inventing an answer.

## Safeguards
- No unrestricted crawler, user-supplied URL, cross-origin redirect, authenticated request, private dashboard access, or database query.
- Each external page request has a short timeout; concurrent requests have an overall bounded wait and maximum document length.
- Retrieved HTML scripts, styles, menus, forms, and footers are stripped; no page text is executed or accepted as an instruction.
- No live webpage retrieval for price, medical/emergency, personal trip, scheduling modification or payment questions. Those continue to their existing authorized handlers.
- Page responses are not persisted; visitor messages, IPs, PHI, travel details and HTML are not logged by this module.
- A website source citation shows the page used. Retrieval does not certify the page's factual correctness or authorize policy changes.

## Acceptance tests
- “Does Nexus have social media?” returns an affirmative answer with actual YouTube, Instagram, TikTok, Facebook and Bluesky links, not the generic fallback.
- A public informational question absent from the static FAQ can return a sourced passage from an allowlisted Nexus page.
- Pricing/private-trip/emergency questions never go to this live fallback.
- Unsafe hosts, malformed sources, scripted content and unavailable site pages are rejected safely.

Live production verification still requires a successful Netlify deployment and the Nexus unit and browser suites. This is **bounded source-grounded retrieval**, not general autonomous browsing of the entire web.
