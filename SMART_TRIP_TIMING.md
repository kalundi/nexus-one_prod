# Smart pickup and drop-off timing

Booking, Dispatch and the fare engine share `nexus-trip-timing.js`. The scheduled pickup is crew arrival, not patient departure. Every passenger leg includes loading/securement, service-adjusted traffic-aware driving, unloading/handoff and a documentation/reliability buffer.

Starting allowances are operational assumptions supplied for Nexus planning, not measured national averages:

| Service | Pickup/loading | Drop-off/handoff |
|---|---:|---:|
| Ambulatory | 10 min | 10 min |
| Wheelchair | 30 min | 20 min |
| Stretcher | 40 min | 30 min |
| Bariatric | 45 min | 35 min |
| Broda | 35 min | 25 min |
| Hospital discharge | 20 min | 20 min |
| Routine facility transfer | 30 min | 20 min |
| BLS, ALS and critical facility transfer | 45 min | 35 min |

Admin → Nexus Pricing Manager → Service travel-time planning controls these allowances, cruising-speed reductions from a configurable 65 mph baseline, a 5-minute reliability/documentation buffer per leg, and a 15-minute appointment check-in lead. Required handoff time in Booking omits the appointment check-in lead. Driver check-in/yard reporting remains a separate existing operational field.

For a wheelchair transfer whose service-adjusted road time is 20 minutes, a 10 AM appointment gives 8:30 AM crew arrival, 9 AM patient departure, 9:20 AM destination arrival, 9:40 AM handoff and 9:45 AM vehicle readiness. The transfer takes 75 minutes. The same 10 AM required-handoff deadline permits an 8:45 AM crew pickup. Facility allowances and history can change these values.

## Facility recognition and operational history

Public facility lookup combines selected Google Places names/categories with exact street-and-ZIP matches from CMS Care Compare hospital, inpatient rehab, nursing-home and dialysis datasets. NPPES organization records provide a further exact-address taxonomy check where a selected facility name is available. Ambiguous or unmatched locations retain an unconfirmed type; Admin can explicitly classify residences and other facilities. Recognition does not reveal facility occupancy or patient handling duration.

CMS/NPI matches are cached in the existing PostgreSQL database for one day. List refreshes read cached identities and Nexus profiles without issuing external registry lookups for every patient. Google-selected metadata is limited to the booking's selected locations. Registry failures retain conservative defaults rather than blocking the route estimate.

Sources: [Google Places types](https://developers.google.com/maps/documentation/javascript/place-types), [CMS hospital directory](https://data.cms.gov/provider-data/dataset/xubh-q36u), [CMS rehab directory](https://data.cms.gov/provider-data/dataset/7t8x-u3ir), [CMS nursing-home directory](https://data.cms.gov/provider-data/dataset/4pq5-n9py), [CMS dialysis directory](https://data.cms.gov/provider-data/dataset/23ew-n7w9), [NPPES API](https://npiregistry.cms.hhs.gov/api-page).

Admin → Facility recognition, access and handling times saves facility type, additional pickup/handoff allowances, a peak window and receiving hours. Entrance/loading/parking/unit instructions are returned only to authenticated staff trip views and the assigned driver. Peak windows are operator knowledge, not live occupancy measurements. OpenStreetMap entrance tags are not automatically ingested by this release.

Completed real trips from the past 180 days provide arrival-to-departure pickup handling and destination-arrival-to-handoff handling, independently of GPS. MOCK/DEMO/TEST trips are excluded. Defaults remain until there are ten qualifying observations; the configurable 85th percentile is then used. Matching weekday and four-hour windows have priority; otherwise the broader facility/service sample has medium confidence. Multi-stop handoff observations without an identifiable stop are excluded. Dispatch and Driver show the source and confidence. The customer booking view keeps pickup, total duration and fare, plus essential schedule notices; operational care allowances, vehicle readiness and facility recognition details appear in staff views.

Public timing responses contain counts and percentile summaries rather than individual trip observations. No patient names, trip references or milestone timestamps are included in facility learning responses.

## Operational behavior

The planner works backward from check-in/handoff deadlines and retains the actual date when pickup crosses midnight. Stops and return legs each receive care allowances; scheduled downtime is separate from preparation. Preparation is not charged as an added wait-time line. Passenger mileage, deadhead, discounts, waiting blocks and fare premiums still use the shared fare engine.

Google driving requests use planned patient departure after loading and a pessimistic traffic model. Multi-stop drives are requested separately because Google stopover requests omit traffic duration. Route caches include the trip schedule. Dispatch refreshes expired forecasts during normal route refreshes: 15 minutes within a day of pickup, one day within a week, and seven days further ahead. Historic trips use static driving routes, since Google cannot request past departure-time traffic.

Existing scheduled pickups are preserved. Dispatch sees a recommendation and can apply it deliberately. Scheduler occupancy runs through handoff/documentation. Driver schedules must cover the full care interval, and conflicting drivers/vehicles are rejected. Automatic assignment requires both resources and a complete route/return schedule; it never falls back to an occupied driver. Automatically competing assignments are serialized.

Driver milestones distinguish patient ready from patient secured. GPS arrival does not confirm handoff. Recorded milestones update progress-based arrival/availability projections and flag threatened deadlines; these projections use planned travel until a new route estimate is obtained. They are not a continuous server-side traffic feed. Existing stakeholder status notifications remain unchanged.

Migration `087.001` creates profiles/identity cache, appointment-date and timing-plan fields and enables shared smart timing. Verification covers real PostgreSQL migration/history/availability queries, booking-to-fare parity, handoff/appointment deadlines, overnight dates, receiving hours, peak boundaries, round trips, multiple stops and mobile layout.

Service speed model: cruising ceilings preserve Google city and traffic estimates. With the default 65 mph baseline, wheelchair is capped at 55 mph, stretcher at 45 mph, ambulance services at 40 mph and Bariatric service at 30 mph. These are planning assumptions, not speed limits. A 9-mile, 25-minute city route is not reduced to a near-zero speed. Only actual care and driving milestones produce progress-based delay warnings; scheduled and assigned updates do not.
