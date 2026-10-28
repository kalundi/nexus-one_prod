# Facility booking and payment

The FutureCare portal opens to **Paid bookings**. Book a Ride uses `/booking-app.html?facility=<registered code>` with the site's standard red booking button. Managers use the main booking app, fare confirmation, and hosted checkout. Facility association is optional for general bookings, defaults to a signed-in manager's assigned facility, and is validated against active facility records on the server. Selecting a facility gives its portal visibility of the trip; it does not make the facility the payer.

Self-pay bookings associated with a facility require the standard 25% deposit or full payment during booking, including signed-in manager/staff bookings. Covered payer selections retain eligibility/approval checks. New facility bookings do not generate facility invoices. Historical facility-account trips retain their legacy payment treatment.

`bookings.facility_id` stores the facility code independently of `booking_source`. The standard facility portal filters trips by the manager's `scope_id`. The FutureCare portal's authenticated `paid-bookings` endpoint resolves exactly one active FutureCare Annapolis record at 2700 Southaven Road, filters to that code and confirmed deposit/full-payment records, and excludes mock/demo bookings. It does not accept a caller-supplied scope. General staff presenter access does not grant real-booking access; platform users must be administrators or assigned to this facility. The managed Annapolis manager session is restricted to this fixed facility view.

Migration `093.001` registers FutureCare if absent and preserves an existing matching code. The portal resolves the code and updates its booking links from the server. Missing or ambiguous registration displays an error rather than another facility's records.

Fictional scenarios remain in Demo trip board and Routes, separate from the default paid-booking view. The former standalone demo form is no longer available for new bookings. Existing simulation APIs and backend regression coverage remain for presentation maintenance.

Validation: `tests/facility-checkout.spec.js` covers desktop/mobile main-app booking, facility payload, checkout handoff, paid-trip display and unavailable facility selection with isolated fixtures. `tests/booking-facility.test.cjs` exercises PostgreSQL association and scope filtering. Payment-policy and demo API checks cover deposit rules, payer approval and presentation isolation. No live charges are used in testing.
