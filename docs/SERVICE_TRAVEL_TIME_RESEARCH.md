# Service travel-time research and Nexus calculation

Reviewed October 10, 2026; calculation revised October 12, 2026. This research concerns passenger driving estimates and the separate time needed for patient assistance. Publications and the age of their underlying measurements are distinguished below.

## What the research supports

The current sources reviewed do not establish universal average speeds for ambulatory, wheelchair, Broda, stretcher or bariatric medical transport vans. The operator has configured cruising-speed reductions of 10 mph for wheelchair, 20 mph for stretcher, 25 mph for ambulance services and 35 mph for Additional Capacity (bariatric). These are Nexus planning assumptions, not established medical standards or directions to drivers. An estimate must account for the route, traffic and service assistance rather than assigning one constant speed to every city and highway trip.

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

Each measured passenger segment supplies distance, baseline road duration and traffic duration. Outbound and return routes are measured separately, and intermediate stops retain their own measurements. Empty vehicle travel retains its Google road estimate.

1. Road average = miles × 60 / baseline road minutes.
2. Cruising ceiling = configurable cruising baseline, initially 65 mph, minus the service reduction.
3. Planning average = min(road average, cruising ceiling). City-route averages are preserved.
4. The minimum ceiling, initially 5 mph, prevents invalid configured ceilings and never speeds up a slow route.
5. Service road minutes = miles × 60 / planning average.
6. Traffic delay = max(0, traffic minutes − original road minutes).
7. Passenger driving minutes = service road minutes + traffic delay.

| Service | Reduction | Default cruising ceiling |
| --- | ---: | ---: |
| Ambulatory | 0 mph | 65 mph |
| Wheelchair | 10 mph | 55 mph |
| Stretcher | 20 mph | 45 mph |
| BLS, ALS and critical-care transfers | 25 mph | 40 mph |
| Additional Capacity | 35 mph | 30 mph |
| Broda and routine facility transfer | 0 mph until configured | 65 mph |

These are operator planning assumptions rather than measured universal patient-transport speeds or speed limits. Actual road conditions, legal limits and patient care govern the driver. Admin can edit the cruising baseline and each service reduction in Nexus Pricing Manager. Policy version 4 selects cruising ceilings; existing service reductions and care allowances remain configurable.

For a 9-mile city leg with a 25-minute baseline and 6 minutes of traffic delay, all the default ceilings exceed the road average of 21.6 mph. Driving therefore remains 31 minutes. Subtracting 20 mph from that city average is no longer part of the current calculation.

For a 60-mile highway leg with a 60-minute baseline and 15 minutes of traffic delay, stretcher's 45 mph ceiling gives 80 minutes of road travel and 95 minutes including traffic. The traffic delay is added once, independently of the service allowance.

Pickup preparation, securement, unloading, handoff, documentation and scheduled waiting remain separate from driving. The shared smart timing planner combines them for journey duration and works backward from appointment or handoff deadlines. Care time is not added as billable waiting. Fare traffic charges continue to use the original measured traffic delay.

Completed real trip history supplies facility handling estimates. The recent service analysis report uses verified DEPARTED-to-ARRIVED_DESTINATION movement and separately measured boarding/handoff milestones; it does not automatically change the configured cruising ceilings.
