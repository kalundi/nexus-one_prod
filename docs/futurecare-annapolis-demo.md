# FutureCare Annapolis facility presentation demo

Presentation URL: https://nexusmt.com/facility-demo.html

This is a proposed Nexus Medical Transit facility solution, not a FutureCare production system or evidence of an existing contract. All five patients, appointments, drivers, vehicles, travel times, messages and operational events are fictional. Location addresses come from the organizations' public websites. No appointments are booked and no transport, billing, SMS or email is triggered.

## Demo access

An authenticated Nexus administrator opens the presentation URL and selects **Prepare demo manager access** once. Save the issued password with **Download demo login details**, then sign in as `annapolis.demo@nexusmt.com`. The separate demo token cannot access real facility or patient records. Demo sessions last eight hours.

## Staggered round trips

All outbound pickups originate at FutureCare Annapolis, 2700 Southaven Road, Annapolis, MD 21401. All returns end at the same facility. The presentation day is Monday, October 26, 2026; it is an illustrative schedule, not an actual booking date.

| Fictional patient | Outbound facility pickup | Appointment | Sample appointment location | Return pickup | Planned back at facility |
| --- | --- | --- | --- | --- | --- |
| Evelyn Hart | 7:35 AM | 8:10 AM | Luminis Health Anne Arundel Medical Center | 1:00 PM | 1:20 PM |
| Marcus Reed | 8:15 AM | 9:00 AM | MedStar Health Physical Therapy at Annapolis | 1:25 PM | 1:45 PM |
| Naomi Brooks | 9:00 AM | 9:45 AM | Kaiser Permanente Annapolis Medical Center | 1:50 PM | 2:08 PM |
| Samuel Parker | 9:35 AM | 10:30 AM | Johns Hopkins Health Care Center–Odenton | 2:15 PM | 2:55 PM |
| Helen Owens | 10:20 AM | 11:30 AM | UM Baltimore Washington Medical Center | 2:40 PM | 3:25 PM |

The automatic return-delay scenario revises Samuel's arrival back at the facility to 3:10 PM. All timings are simulated, not measured traffic estimates.

## Suggested presentation flow

1. Sign in as the demo facility manager. Introduce the five patients, morning pickup column, appointments, return pickup column and live status/ETA.
2. Select **Start / restart morning**. At 120×, the full day takes about four minutes; 240× takes about two minutes. Pause or move the clock at any point.
3. Select any patient. Show their named driver, vehicle, transport type, all four schedule milestones, full A/B addresses and road route. Switch between **Outbound** and **Return**.
4. Select **Morning delay**. Marcus's row, attention metric and page banner turn amber. The manager inbox shows the revised 8:50 AM destination ETA and intended notification recipients.
5. Select **Reported issue**. Naomi's receiving-location issue turns the board and banner red. **Acknowledge alerts** records awareness without resolving the issue. Select Naomi and **Resolve active issue** to clear the active risk and show the resolution in the inbox.
6. Select **1 PM returns** to demonstrate the first return departure. Other return pickups remain staggered at 1:25 PM, 1:50 PM, 2:15 PM and 2:40 PM.
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
