# Service travel-time research and Nexus calculation

Reviewed October 10, 2026. This research concerns non-emergency passenger transport, including ambulatory and wheelchair van trips.

## What the research supports

There is no universal published average speed for ambulatory, wheelchair, Broda, stretcher or bariatric medical transport vans in the sources reviewed. A wheelchair allowance of 10 mph is a Nexus planning assumption requested by the operator, not an established medical standard or a direction to the driver. An estimate must account for the route, traffic and service assistance rather than assigning one constant speed to every city and highway trip.

The [NHTSA National Traffic Speeds Survey III: 2015, published in 2018](https://www.nhtsa.gov/sites/nhtsa.gov/files/documents/812485_national-traffic-speeds-survey-iii-2015.pdf) measured traffic at sampled road locations. Its [Traffic Tech summary](https://rosap.ntl.bts.gov/view/dot/35965/dot_35965_DS1.pdf) reports these historical mean speeds:

| Road context | Observed mean speed |
| --- | ---: |
| Urban major arterial | 43.8 mph |
| Urban minor arterial / collector | 38.71 mph |
| Suburban major arterial | 52.87 mph |
| Rural major arterial | 59.16 mph |

These are speeds at measurement locations, not door-to-door averages or recommended speeds. They cannot be entered directly as medical transport vehicle averages. The road-class and location differences explain why the booking route is a better starting point than a single fleet-wide number.

[FHWA's Conditions and Performance report](https://www.fhwa.dot.gov/policy/23cpr/chap4.cfm) illustrates another distinction: its 2014 passenger-carrying transit averages were 15.5 mph for demand response and 39.9 mph for vanpool. Those averages include dwell at stops. FHWA identifies stop spacing and boarding/alighting time as major influences. Using those averages to estimate driving and then adding boarding time again would double-count part of the delay.

[Lund University's wheelchair passenger research](https://portal.research.lu.se/sv/publications/wheelchair-passengers-and-local-public-transport-vehicles-percept/) investigates perceived safety and comfort across wheelchair passenger transport. [University of Michigan's Wheelchair Transportation Safety program](https://wc-transportation-safety.umtri.umich.edu/) provides guidance on wheelchair and occupant transport. These sources support evaluating patient comfort and transport arrangements, but do not establish a single average van speed or a universal 10 mph deduction. Vehicle size alone also does not establish a different driving average for bariatric patients.

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

Use completed trips to measure passenger driving separately from loading, securement, waiting and unloading. Exclude mock trips, deadhead, cancellations and incomplete timestamps. Compare similar routes, road mixes and pickup periods, with at least 30 complete trips per comparison group as an initial operational target rather than a statistical guarantee.

For each actual passenger leg, calculate miles / actual driving hours and compare actual driving minutes with the stored baseline and traffic estimate. Report medians and the 80th and 90th percentile arrival error by service and route context. A fixed reduction should be adjusted only after inspecting those errors; a percentage time allowance may ultimately fit better than a fixed mph difference. Preserve the raw route evidence so that changing a planning assumption does not rewrite observed history.
