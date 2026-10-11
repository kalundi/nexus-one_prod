# Service travel-time research and Nexus calculation

Reviewed October 10, 2026. This research concerns passenger driving estimates and the separate time needed for patient assistance. Publications and the age of their underlying measurements are distinguished below.

## What the research supports

The current sources reviewed do not establish universal average speeds for ambulatory, wheelchair, Broda, stretcher or bariatric medical transport vans. A wheelchair allowance of 10 mph is a Nexus planning assumption requested by the operator, not an established medical standard or a direction to the driver. An estimate must account for the route, traffic and service assistance rather than assigning one constant speed to every city and highway trip.

### Recent transport and patient-comfort evidence

The [FTA 2024 National Transit Summaries and Trends, updated April 2026](https://www.transit.dot.gov/sites/fta.dot.gov/files/2026-04/2024%20National%20Transit%20Summaries%20and%20Trends_1.2.pdf) defines average revenue speed as vehicle revenue miles divided by revenue hours. Boarding, unloading and dwell are included; its 41.6 mph vanpool average is not a patient-carrying van's driving-only average. Demand-response and vanpool figures therefore cannot be assigned to Nexus services and then supplemented with the same assistance time again.

A [2025 neonatal ambulance study](https://pubmed.ncbi.nlm.nih.gov/39762002/) analysed 1,487 journeys recorded in 2018–2019. Noise increased with speed, but vibration did not show a statistically significant speed correlation. Road surface and road type affected vibration exposure. This is recent publication of older neonatal measurements, not current adult wheelchair, stretcher or bariatric fleet speeds. It supports considering the vehicle and road environment rather than claiming that a fixed mph deduction alone ensures comfort.

A [2024 ambulance suspension study](https://pubmed.ncbi.nlm.nih.gov/38490776/) used neonatal and adult mannequin setups. Liquid suspension produced lower measured vibration than the compared suspension systems. These simulated measurements help explain vehicle differences; they do not establish average driving speeds or adult patient outcomes.

The [March 2026 patient-comfort study](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0341608) combined modelling with a patient survey to examine road-condition effects during interhospital transport. Bumpy roads and continuous speed bumps adversely affected comfort, with effects depending on the body region and stretcher/suspension characteristics. It supplies no general mph schedule for the Nexus service categories.

### Care considerations for each service

| Service | Factors to measure separately from driving |
| --- | --- |
| Ambulatory | Boarding assistance and seatbelt checks |
| Wheelchair | Lift/ramp access, wheelchair securement and occupant restraints |
| Broda | Chair-specific transfer and transport setup |
| Stretcher | Loading, restraints and patient handoff; road and vehicle comfort during travel |
| Bariatric | Crew/equipment setup, assisted loading and handoff |
| Facility transfer | Actual mobility needs and facility handoff |
| BLS / ALS / critical transfer | Clinical preparation, monitoring needs and care handoff |

These are operational measurement categories, not clinical protocols or prescribed driving speeds. Patient needs, the vehicle, road conditions and traffic can differ within the same service. [University of Michigan's Wheelchair Transportation Safety program](https://wc-transportation-safety.umtri.umich.edu/) provides guidance on wheelchair securement and occupant protection; it does not establish a universal 10 mph deduction.

### Historical context

The [NHTSA National Traffic Speeds Survey III: 2015, published in 2018](https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/812485_national-traffic-speeds-survey-iii-2015.pdf) measured traffic at sampled road locations. Its [Traffic Tech summary](https://rosap.ntl.bts.gov/view/dot/35965/dot_35965_DS1.pdf) reports these historical mean speeds:

| Road context | Observed mean speed |
| --- | ---: |
| Urban major arterial | 43.8 mph |
| Urban minor arterial / collector | 38.71 mph |
| Suburban major arterial | 52.87 mph |
| Rural major arterial | 59.16 mph |

These are speeds at measurement locations, not door-to-door averages or recommended speeds. They cannot be entered directly as medical transport vehicle averages. The road-class and location differences explain why the booking route is a better starting point than a single fleet-wide number.

## Model implemented in Nexus

The input is each measured passenger segment's distance, baseline route duration and traffic duration. Outbound and return directions are measured separately. Multi-stop outbound legs retain separate distances and durations. Empty vehicle segments retain their road estimates.

1. Baseline route average = miles × 60 / baseline route minutes.
2. Planning average = baseline route average minus the configured service reduction.
3. A configurable minimum planning average, initially 5 mph, prevents zero or negative speed. It never raises a route average that is already below that minimum.
4. Service baseline minutes = miles × 60 / planning average.
5. Traffic delay = max(0, traffic minutes minus original baseline minutes).
6. Estimated driving minutes = service baseline minutes plus traffic delay.
7. Journey duration = passenger driving, scheduled waiting and assistance between intermediate stops. It excludes empty vehicle travel and yard preparation.

The speed allowance is applied to the original route baseline, not to the already-congested average. This preserves traffic delay separately. Original route measurements remain unchanged, so switching services, refreshing estimates and changing settings do not compound the allowance. The allowance does not become a traffic surcharge; actual traffic overage remains based on the original measured traffic delay.

| Service | Initial speed reduction | Assistance between intermediate stops |
| --- | ---: | ---: |
| Ambulatory | 0 mph | 10 min |
| Wheelchair | 10 mph | 15 min |
| Stretcher | 0 mph until configured | 25 min |
| Bariatric | 0 mph until configured | 25 min |
| Broda, facility transfer and ambulance services | 0 mph until configured | 10 min |

These assistance values retain the existing Nexus scheduling allowances. All reductions and intermediate assistance times can be edited separately for each service in **Nexus Pricing Manager → Service travel-time planning**. Remaining services retain their route baseline because the research does not justify inventing new fixed averages for them.

## Worked example

For a 20-mile leg with a 30-minute baseline, the route average is 40 mph. Assume the reverse direction has the same measurements and the scheduled appointment waiting is 60 minutes:

| Service | Planning average | Outbound driving | Return driving | Waiting | Round-trip duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ambulatory | 40 mph | 30 min | 30 min | 60 min | 2h |
| Wheelchair | 30 mph | 40 min | 40 min | 60 min | 2h 20m |

If the route also predicts 20 minutes of traffic delay per direction, each leg adds that delay once: ambulatory becomes 50 minutes per leg and wheelchair becomes 60 minutes. With the same 60-minute appointment wait, the round-trip durations become 2h 40m and 3h. Real return distances and traffic can differ from outbound measurements.

For pickup-based bookings, waiting is recalculated from the adjusted arrival to the scheduled return pickup. For appointment-based bookings, pickup moves earlier to preserve the existing 15-minute early-arrival allowance. Intermediate departures are calculated backward from the next appointment using that service's driving time and assistance allowance. Waiting includes the free waiting period in elapsed duration; only its billable portion contributes a waiting charge.

The time above each service fare shows passenger driving, including both directions for a round trip. The selected ride separately shows its return date, waiting included in the fare, intermediate assistance and total elapsed journey. Multi-day gaps are formatted as days and hours rather than hundreds of hours of apparent driving. The default return date follows the outbound date; an explicitly chosen later return date is retained. A later return currently represents continuous waiting under the existing booking policy, so its waiting and charge remain visible for review.

## Traffic and estimation limits

[Google's Directions Service documentation](https://developers.google.com/maps/documentation/javascript/legacy/directions) distinguishes baseline duration from predicted traffic duration. A traffic departure time must be present or future. Traffic duration is unavailable for requests containing stopover waypoints, so multi-stop routes may use baseline travel when the provider supplies no traffic prediction. Historic trips also use baseline duration rather than a fabricated historic traffic value. Future outbound requests now use the entered schedule instead of the current clock.

If routing is unavailable, the existing local fallback is still an approximation; its service travel calculation uses that fallback's distances and baseline durations. It is not a measured fleet average. All displayed times are estimates, rounded upward once at the end.

## How to calibrate the service assumptions

**Nexus Pricing Manager → Recent service speeds and patient-care time** now provides a read-only report for the last 30, 90 or 180 days; 90 days is the default. The report displays the configured speed adjustment, observed passenger driving average, boarding and handoff medians, and separate trip/leg/sample counts for every configured service. Missing measurements remain labelled “No verified data.” It does not replace route predictions or automatically change a fare or speed setting.

Only completed, non-mock bookings are eligible. Passenger driving runs from the recorded `DEPARTED` event to `ARRIVED_DESTINATION`. Boarding runs from `ARRIVED_PICKUP` to departure; handoff runs from destination arrival to `DELIVERED`. Appointment waiting and deadhead are outside those driving windows. A completed round trip can contribute two loaded legs while counting as one distinct trip. Duplicate stage events preserve the first arrival/departure timestamp.

Driving distance is derived from consecutive GPS coordinates assigned to the booking and vehicle. The analysis requires at least three usable fixes, at least 90% coverage of the driving window, endpoints within two minutes, no gap longer than three minutes, and no segment or overall average above 80 mph. Fixes with reported accuracy worse than 50 metres are excluded. Coordinate movements below approximately five metres are omitted to reduce stationary jitter. Boarding and handoff intervals over four hours are omitted as likely incomplete records. These are report quality filters, not service speed instructions.

The observed driving average is total GPS miles divided by total recorded passenger driving hours, including traffic stops. Care intervals use medians and their own sample counts. GPS distance remains approximate: curves between samples can be underestimated and location noise can increase distance. A service-wide average also mixes road types and traffic. Neither sample count nor “ready for route comparison” proves that a new reduction is appropriate.

The database read is limited to the latest 1,000 eligible completed bookings in the selected period. A visible notice identifies truncated reports. Only aggregate service results are returned to authenticated administrators and dispatchers; patient names, addresses, booking references and raw GPS coordinates are not included.

Use completed trips to measure passenger driving separately from loading, securement, waiting and unloading. Exclude mock trips, deadhead, cancellations and incomplete timestamps. Compare similar routes, road mixes and pickup periods, with at least 30 complete trips per comparison group as an initial operational target rather than a statistical guarantee.

For each actual passenger leg, calculate miles / actual driving hours and compare actual driving minutes with the stored baseline and traffic estimate. Report medians and the 80th and 90th percentile arrival error by service and route context. A fixed reduction should be adjusted only after inspecting those errors; a percentage time allowance may ultimately fit better than a fixed mph difference. Preserve the raw route evidence so that changing a planning assumption does not rewrite observed history.
