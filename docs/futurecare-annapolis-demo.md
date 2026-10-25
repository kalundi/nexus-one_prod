# FutureCare Annapolis facility presentation demo

Presentation URL: https://nexusmt.com/facility-demo.html

The sign-in screen and dashboard use the existing Nexus logo and platform navy, blue and red palette. The collaboration banner includes exterior, reception and rehabilitation photos from FutureCare's public Annapolis page, with a visible source link. This is labeled a proposed collaboration. Asset sources are recorded in `assets/futurecare-annapolis/README.md`.

This is a proposed Nexus Medical Transit facility solution, not a FutureCare production system or evidence of an existing contract. All five patients, appointments, drivers, vehicles, travel times, messages and operational events are fictional. Location addresses come from the organizations' public websites. No appointments are booked and no transport, billing, SMS or email is triggered.

## Demo access

An authenticated Nexus administrator opens the presentation URL and selects **Prepare demo manager access** once. Save the issued password with **Download demo login details**, then sign in as `annapolis.demo@nexusmt.com`. The separate demo token cannot access real facility or patient records. Demo sessions last eight hours.

## Staggered round trips

All outbound pickups originate at FutureCare Annapolis, 2700 Southaven Road, Annapolis, MD 21401. All returns end at the same facility. Use the Demo day selector for Monday, October 26 through Friday, October 30, 2026. Each day has five fictional patient round trips (ten transport legs), for 25 round trips / 50 legs total. Each day keeps its own clock, schedule, alerts and invoice. Changing days pauses the outgoing presentation. These are illustrative schedules, not actual bookings.

| Fictional patient | Outbound facility pickup | Appointment | Sample appointment location | Return pickup | Planned back at facility |
| --- | --- | --- | --- | --- | --- |
| Evelyn Hart | 7:35 AM | 8:10 AM | Luminis Health Anne Arundel Medical Center | 9:10 AM (1 hour) | 9:30 AM |
| Marcus Reed | 8:15 AM | 9:00 AM | MedStar Health Physical Therapy at Annapolis | 11:00 AM (2 hours) | 11:20 AM |
| Naomi Brooks | 9:00 AM | 9:45 AM | Kaiser Permanente Annapolis Medical Center | 12:45 PM (3 hours) | 1:03 PM |
| Samuel Parker | 9:35 AM | 10:30 AM | Johns Hopkins Health Care Center–Odenton | 11:30 AM (1 hour) | 12:10 PM |
| Helen Owens | 10:20 AM | 11:30 AM | UM Baltimore Washington Medical Center | 1:30 PM (2 hours) | 2:15 PM |

The table shows the default October 26 schedule before scenario delays. Subsequent days offset appointments by five minutes per day and rotate 1-, 2- and 3-hour appointment intervals. The automatic return-delay scenario follows Samuel's edited return pickup and adds 15 minutes to his arrival. All timings are simulated, not measured traffic estimates.

## Suggested presentation flow

1. Sign in as the demo facility manager. Introduce the five patients, morning pickup column, appointments, return pickup column and live status/ETA.
2. Select **Start / restart morning**. At 120×, the full day takes about four minutes; 240× takes about two minutes. Pause or move the clock at any point.
3. Select any patient. Show their named driver, vehicle, transport type, all four schedule milestones, full A/B addresses and road route. Switch between **Outbound** and **Return**.
4. Select **Morning delay**. Marcus's row, attention metric and page banner turn amber. The manager inbox shows the revised 8:50 AM destination ETA and intended notification recipients.
5. Select **Reported issue**. Naomi's receiving-location issue turns the board and banner red. **Acknowledge alerts** records awareness without resolving the issue. Select Naomi and **Resolve active issue** to clear the active risk and show the resolution in the inbox.
6. Select **First return** to demonstrate the earliest return departure for the selected day. Select a patient, choose a 1-, 2- or 3-hour appointment interval or enter a custom return pickup, and save. The board, route timeline, manager notifications and invoice update. The vehicle-stays checkbox controls whether the appointment interval is billable waiting.
7. Select **Return delay**. Samuel's revised facility return ETA is visible to the manager, receiving team, destination contact, authorized patient/caregiver and dispatch in the simulated notification entry.
8. Move the clock to the end to show all five patients back at FutureCare and each receiving handoff complete.

Manual **Report 15-minute delay** and **Report an issue** controls apply to the selected patient's demo trip. Shared state synchronizes between signed-in demo manager sessions; it is not browser-only. Restart clears scenario overrides and acknowledgment state for a clean walkthrough. Actual email/SMS delivery is not part of this demo.

## Public location references

- [FutureCare Annapolis](https://www.futurecare.com/locations/annapolis/): 2700 Southaven Road, Annapolis, MD 21401.
- [Luminis Health Anne Arundel Medical Center](https://www.luminishealth.org/en/find-a-location/lhaamc?language_content_entity=en): 2001 Medical Parkway, Annapolis, MD 21401.
- [MedStar Health Physical Therapy at Annapolis](https://www.medstarhealth.org/services/outpatient-physical-therapy): 810 Bestgate Road, 3rd Floor, Annapolis, MD 21401.
- [Kaiser Permanente Annapolis Medical Center](https://healthy.kaiserpermanente.org/maryland-virginia-washington-dc/facilities/annapolis-medical-center-100425): 888 Bestgate Road, Suite 111, Annapolis, MD 21401.
- [Johns Hopkins Health Care Center–Odenton](https://www.hopkinsmedicine.org/patient-care/locations/johns-hopkins-health-care-center-odenton): 1132 Annapolis Road, Suite 101, Odenton, MD 21113.
- [UM Baltimore Washington Medical Center](https://www.umms.org/bwmc): 301 Hospital Drive, Glen Burnie, MD 21061.

Location references establish addresses, not appointment availability, eligibility, affiliation or a transport agreement. Road routes require a working Google Maps connection. Full route addresses remain visible if the map service is unavailable.
# Daily billing demonstration

Open **Daily invoicing** in the manager navigation. Select a day or month; October 26–30, 2026 each contains five fictional round trips (ten separately priced one-way legs). Monthly totals cover all five dates, with each invoice marked draft or finalized. Other periods show an empty statement. Expand a trip's fare details or use Print / save PDF.

The server uses configured Nexus platform pricing and the shared NexusFare engine. Base fares, loaded mileage, fuel, time premiums/minimums, waiting, positioning, short-notice and processing charges reconcile in cents to trip and period totals. Distances are illustrative demo inputs, not measured road miles. The 1-, 2- or 3-hour interval starts at the appointment time and ends at return pickup. When Vehicle stays is checked, the interval is charged once on the return leg under configured free minutes and 15-minute blocks. Uncheck it for a separate return vehicle with no appointment waiting charge. Reported delays alone do not create charges.

The estimate captures pricing on its first authenticated state/billing read. Once all five return handoffs complete, a server-side poll finalizes the daily invoice once and displays its simulated delivery to the demo manager inbox. Invoices survive replay/restart; replay does not create another bill. A schedule edit recalculates only that day using current configured pricing, creates a new invoice revision, and retains previous versions and delivery records for audit. Only the latest revision counts toward period totals. A revised draft is delivered in the simulated inbox once all returns for that day are complete. Delivery requires the active demo polling session; no scheduled production email service or external message is configured. This is a demonstration invoice, with no payment due. Production automation would require verified route/billable inputs and a configured recipient/delivery schedule.
