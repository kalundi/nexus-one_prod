# Nex knowledge approval and publication runbook

## Security and privacy
This is an administrative editorial flow only. Public visitors' raw questions are **not** saved as knowledge drafts. AI-derived recommendation text is kept in the separate review queue. Drafts must be written from verified, public Nexus website sources; never enter patient health details, names, trip addresses or contact information into FAQ drafts.

## Workflow
1. In **Nex Insights**, generate an aggregated recommendation and mark it **reviewed**. Dismissed and pending recommendations cannot create FAQ drafts.
2. In the **Nex knowledge approval workspace**, supply the reviewed recommendation number, a representative FAQ question, a factual answer grounded in an approved page, and that page's filename.
3. Click **Preview and validate**. This runs the same structural/source/link/phone/rate validator used by the runtime-approved FAQ loader. It **does not fact-check the cited webpage**.
4. Save the draft. Revisions are versioned and require matching revision numbers to prevent overwriting concurrent edits.
5. Verify every claim against the selected public Nexus page. Select **Approve for export** and attest to source verification. An approved draft is immutable; update an answer by creating a new draft.
6. Select **Export approved JSON** and copy the exported single entry. Publication requires a **separate GitHub pull request** editing `netlify/functions/_shared/nex-approved-knowledge.json` to include the entry. Never replace or wipe existing entries. Check for duplicate IDs and contradictory answers before adding.
7. Review the GitHub diff, run the Nex tests and a production-equivalent build, and **merge only after review**. Netlify must deploy the merged commit for Nex to use the change.
8. Test representative questions in production, confirm sources and fallback responses, and verify that prices, service coverage, medical policies and personal data have not been invented.

## Rollback
Use GitHub to revert the publication commit (or a subsequent corrective PR) to restore the prior approved-knowledge JSON, deploy the revert, and retest Nex. Database editorial history is retained as an audit record and does not itself publish or rollback live knowledge.

## Deliberate limitations
Approval is a human editorial decision, not an automatic live publish. The staged editor only validates formatting and hard rules, not factual corroboration. A GitHub review/merge and successful Netlify deployment are mandatory. Browser preview displays the proposed answer, not a claim that the live assistant already uses it.
