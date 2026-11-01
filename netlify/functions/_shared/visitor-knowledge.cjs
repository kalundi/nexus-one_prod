'use strict';
/*
 * Nexus Medical Transit — visitor assistant knowledge base.
 *
 * Every entry is drawn from the public website's own content (page copy and
 * the FAQPage JSON-LD published on the service/area pages). The `source`
 * field on each entry names the page it came from. The assistant answers
 * ONLY from these entries.
 *
 * Editorial rules (do not break when editing):
 *  - No prices or fare figures: the site does not publish them, so the
 *    assistant must never quote one. Pricing questions go to the
 *    `pricing` entry.
 *  - Phone numbers: only the two public lines below. Never add any other
 *    number (in particular no 240- or 202- area-code numbers).
 *  - No street address: listings use "Clarksburg, MD" only.
 */

const CONTACT = {
  mainPhoneDisplay: '(888) 639-5766',
  mainPhoneHref: 'tel:+18886395766',
  ambulancePhoneDisplay: '(888) 760-4990',
  ambulancePhoneHref: 'tel:+18887604990',
  email: 'contact@nexusmt.com',
  bookingUrl: 'https://mynexusride.com',
  livecareUrl: 'https://nexusmt.com/livecare.html'
};

const ENTRIES = [
  // ---------------------------------------------------------------- services
  {
    id: 'services-overview',
    topic: 'Services',
    questions: [
      'What services do you offer?',
      'What transportation do you provide?',
      'What types of rides do you do?',
      'What is non-emergency medical transportation?'
    ],
    keywords: ['services', 'offer', 'provide', 'nemt', 'non-emergency medical transportation', 'types of rides', 'transportation options'],
    answer:
      'Nexus Medical Transit provides planned, non-emergency medical transportation (NEMT) across Maryland, Washington, DC, and Northern Virginia. Services include ambulatory rides, wheelchair transportation, stretcher transportation, bariatric transportation, ambulance transportation (BLS/ALS), dialysis and recurring rides, hospital discharge rides, and medical shuttle support. Drivers provide door-through-door support — help from inside the pickup location, secure boarding, and an accompanied arrival at check-in.',
    source: 'non-emergency-medical-transportation.html'
  },
  {
    id: 'ambulatory',
    topic: 'Services',
    questions: ['Do you offer rides for people who can walk?', 'What is ambulatory transportation?'],
    keywords: ['ambulatory', 'walking passenger', 'walk', 'assisted ride'],
    answer:
      'Ambulatory transportation is for walking passengers who need reliable, assisted rides to appointments. It is one of the ride types Nexus coordinates across Maryland, Washington, DC, and Northern Virginia.',
    source: 'non-emergency-medical-transportation.html'
  },
  {
    id: 'wheelchair',
    topic: 'Services',
    questions: [
      'Do you offer wheelchair transport?',
      'Do you have wheelchair-accessible vehicles?',
      'Can you take a passenger in their own wheelchair?'
    ],
    keywords: ['wheelchair', 'accessible vehicle', 'securement', 'wheelchair van'],
    answer:
      'Yes. Nexus provides wheelchair-accessible transportation for hospital discharge, dialysis, therapy, specialty appointments, and recurring healthcare travel. Vehicles provide accessible entry and securement support, and the team coordinates with passengers and caregivers from pickup through arrival. LiveCare ride visibility is available when tracking is enabled.',
    source: 'wheelchair-transportation.html'
  },
  {
    id: 'stretcher',
    topic: 'Services',
    questions: ['Do you offer stretcher transportation?', 'Can you transport a patient who cannot sit up?'],
    keywords: ['stretcher', 'lying down', 'reclined', 'positioned transport', 'cannot sit'],
    answer:
      'Yes. Nexus coordinates non-emergency stretcher transportation for passengers who cannot travel seated and need positioned transport aligned with clinical scheduling — including hospital discharge, scheduled interfacility transfers, post-procedure return trips, and recurring travel requiring positioned transport. Hospitals, rehabilitation centers, skilled nursing facilities, and discharge planners can coordinate trips when passenger details and timing are ready.',
    source: 'stretcher-transportation.html'
  },
  {
    id: 'bariatric',
    topic: 'Services',
    questions: ['Do you offer bariatric transportation?', 'Do you have higher-capacity vehicles?'],
    keywords: ['bariatric', 'higher capacity', 'capacity', 'larger passenger', 'heavy duty'],
    answer:
      'Yes. Nexus plans bariatric transportation in advance: the right vehicle, the right equipment — higher-capacity wheelchair securement or stretcher — and a crew briefed on the pickup location, so there are no surprises at the door. When you book, share the passenger\u2019s mobility equipment and any access details (steps, doorways, elevator) and the trip is matched to them. If you are not sure which vehicle is needed, call (888) 639-5766 — that is a planning conversation, not a guess at pickup.',
    source: 'bariatric-transportation.html'
  },
  {
    id: 'ambulance',
    topic: 'Services',
    questions: [
      'Do you offer ambulance transportation?',
      'What is the difference between BLS and ALS?',
      'Do you do interfacility transfers?'
    ],
    keywords: ['ambulance', 'bls', 'als', 'emt', 'paramedic', 'interfacility transfer', 'clinical support'],
    answer:
      'Yes. Nexus provides scheduled, non-emergency ambulance transportation for patients who need clinical support during transport: interfacility transfers, hospital-to-facility and facility-to-home discharges, and appointments that require a stretcher and a trained crew. BLS units are staffed by EMTs; ALS transport adds paramedic-level care. The patient\u2019s care team decides between BLS and ALS based on the care and monitoring needed during the trip, and Nexus confirms the level of service when the trip is booked. For ambulance service questions you can also call the Ambulance Services line at (888) 760-4990. Nexus ambulance transportation is planned and non-emergency — for an emergency, call 911.',
    source: 'ambulance-transportation.html'
  },
  {
    id: 'dialysis',
    topic: 'Services',
    questions: ['Do you do dialysis transportation?', 'Can I set up recurring rides?', 'Do you offer standing schedules?'],
    keywords: ['dialysis', 'recurring', 'standing schedule', 'repeat trips', 'ongoing treatment', 'therapy rides'],
    answer:
      'Yes. Nexus supports dialysis and other recurring transportation with standing schedules for ongoing treatment — recurring weekly setup, morning and afternoon treatment coordination, and pickup planning around treatment completion windows. Recurring travel can be coordinated when the treatment pattern and pickup details are known. Call (888) 639-5766 to set up a standing schedule.',
    source: 'dialysis-transportation.html'
  },
  {
    id: 'hospital-discharge',
    topic: 'Services',
    questions: ['Do you do hospital discharge transportation?', 'Can you pick up a patient being discharged?'],
    keywords: ['discharge', 'hospital release', 'leaving the hospital', 'return home after discharge'],
    answer:
      'Yes. Nexus coordinates hospital discharge transportation planned around the passenger, caregiver, and release timeline — hospital release pickup planning, destination confirmation, caregiver communication, and mobility-aware vehicle matching. Family members, caregivers, and hospital discharge teams can all help arrange discharge rides.',
    source: 'hospital-discharge-transportation.html'
  },
  {
    id: 'medical-shuttle',
    topic: 'Services',
    questions: ['Do you offer medical shuttle service?', 'Can you run a shuttle for a facility or program?'],
    keywords: ['shuttle', 'facility shuttle', 'program shuttle', 'group transportation'],
    answer:
      'Nexus offers medical shuttle support — scheduled shuttle service for facilities and programs — as part of its transportation services across Maryland, Washington, DC, and Northern Virginia. Call (888) 639-5766 to discuss a shuttle arrangement.',
    source: 'non-emergency-medical-transportation.html'
  },
  {
    id: 'door-through-door',
    topic: 'Services',
    questions: ['Will the driver help the passenger to the door?', 'Do you offer door-through-door service?', 'Does the driver come inside?'],
    keywords: ['door-through-door', 'door to door', 'help inside', 'escort', 'assistance at pickup', 'help boarding'],
    answer:
      'Yes. Nexus drivers provide door-through-door support — help from inside the pickup location, secure boarding, and an accompanied arrival at check-in — rather than a curbside-only ride.',
    source: 'non-emergency-medical-transportation.html'
  },

  // ------------------------------------------------------------------- areas
  {
    id: 'areas-overview',
    topic: 'Service areas',
    questions: ['What areas do you serve?', 'Where do you operate?', 'What is your coverage area?'],
    keywords: ['areas', 'serve', 'coverage', 'operate', 'locations', 'region'],
    answer:
      'Nexus serves Maryland, Washington, DC, and Northern Virginia. In Maryland, coordination commonly includes Montgomery County, Prince George\u2019s County, Howard County, Frederick County, and Anne Arundel County (including Annapolis). In Northern Virginia, trips often involve Arlington, Alexandria, Fairfax, and surrounding communities. Coverage for a specific trip depends on the trip details, destination, and availability — call (888) 639-5766 with your pickup and destination and we will confirm.',
    source: 'contact-service-areas.html; wheelchair-transportation.html; maryland-medical-transportation.html'
  },
  {
    id: 'area-montgomery-county',
    topic: 'Service areas',
    questions: ['Do you serve Montgomery County?', 'Are you based in Montgomery County?', 'Do you serve Clarksburg, Rockville, Bethesda, or Gaithersburg?'],
    keywords: ['montgomery county', 'clarksburg', 'rockville', 'bethesda', 'gaithersburg', 'germantown', 'silver spring'],
    answer:
      'Yes. Nexus operates from Clarksburg, MD, and serves all of Montgomery County as part of its Maryland, Washington, DC, and Northern Virginia coverage. Recurring dialysis and other standing schedules can be arranged in Montgomery County — call (888) 639-5766.',
    source: 'medical-transportation-montgomery-county.html'
  },
  {
    id: 'area-annapolis',
    topic: 'Service areas',
    questions: ['Do you serve Annapolis?', 'Do you serve Anne Arundel County?'],
    keywords: ['annapolis', 'anne arundel'],
    answer:
      'Yes. Nexus serves Annapolis and Anne Arundel County, including discharge transportation for Annapolis facilities and longer regional trips from Annapolis to DC or Baltimore hospitals. Call (888) 639-5766 with your pickup and destination to confirm coverage for a specific trip.',
    source: 'medical-transportation-annapolis.html'
  },
  {
    id: 'area-dc',
    topic: 'Service areas',
    questions: ['Do you serve Washington, DC?', 'Can you take a passenger to a DC hospital?'],
    keywords: ['washington dc', 'dc', 'district of columbia'],
    answer:
      'Yes. Nexus supports planned healthcare travel in Washington, DC — specialist appointments, recurring treatment, hospital discharge, and coordinated outpatient travel. Caregivers and facilities can coordinate DC trips, and ride coordination frequently supports hospital and clinic appointments, discharge planning and return-home transportation, rehabilitation and therapy visits, and specialty schedules.',
    source: 'washington-dc-medical-transportation.html'
  },
  {
    id: 'area-northern-virginia',
    topic: 'Service areas',
    questions: ['Do you serve Northern Virginia?', 'Do you serve Arlington, Alexandria, or Fairfax?'],
    keywords: ['northern virginia', 'arlington', 'alexandria', 'fairfax', 'virginia'],
    answer:
      'Yes. Nexus supports planned healthcare travel across Northern Virginia, including Arlington, Alexandria, Fairfax, and nearby communities — routine appointments, discharge support, dialysis trips, and other planned medical transportation. Trips into DC and Maryland are also part of regular coverage.',
    source: 'northern-virginia-medical-transportation.html'
  },
  {
    id: 'area-outside',
    topic: 'Service areas',
    questions: ['Do you serve addresses outside your area?', 'Can you travel outside Maryland, DC, and Virginia?'],
    keywords: ['outside', 'out of area', 'another state', 'long distance', 'far'],
    answer:
      'Nexus coverage is Maryland, Washington, DC, and Northern Virginia, and trips between those areas — for example from Annapolis to DC or Baltimore hospitals — are part of regular coverage. For a pickup or destination outside that region, call (888) 639-5766 and the team will confirm what can be scheduled for your specific trip.',
    source: 'medical-transportation-montgomery-county.html; medical-transportation-annapolis.html'
  },

  // ------------------------------------------------------------- visiting info
  {
    id: 'hours',
    topic: 'Hours',
    questions: ['What are your hours?', 'When are you open?', 'What time do you close?'],
    keywords: ['hours', 'open', 'close', 'when', 'schedule', 'weekend'],
    answer:
      'Nexus normal hours are Monday\u2013Friday, 7 AM\u20137 PM. Transportation itself is scheduled in advance around appointment and treatment times. To arrange a trip, book online at https://mynexusride.com or call (888) 639-5766 during normal hours.',
    source: 'platform.js (site footer: "Normal Hours: Mon-Friday, 7 AM-7 PM")'
  },
  {
    id: 'booking-how',
    topic: 'Booking',
    questions: ['How do I book a ride?', 'How do I schedule transportation?', 'How far in advance should I book?'],
    keywords: ['book', 'schedule a ride', 'reserve', 'request transportation', 'in advance', 'appointment'],
    answer:
      'You can book online at https://mynexusride.com or call (888) 639-5766. Book as early as you can — planned trips let us match the right vehicle and crew. When you book, have the passenger\u2019s pickup and destination addresses, appointment time, and mobility or equipment needs ready.',
    source: 'non-emergency-medical-transportation.html (FAQPage JSON-LD); contact-service-areas.html'
  },
  {
    id: 'pricing',
    topic: 'Pricing',
    questions: ['How much does a ride cost?', 'What are your prices?', 'Can I get a quote?', 'What is the fare?'],
    keywords: ['cost', 'price', 'pricing', 'how much', 'fare', 'rate', 'charge', 'quote', 'estimate', 'expensive', 'fee'],
    answer:
      'Nexus does not publish set fares on the website, because the price of a trip depends on the trip itself — distance, service level, required personnel and equipment, and timing. You can get an estimate for your specific trip in the online booking at https://mynexusride.com, or call (888) 639-5766 and the team will quote it with your trip details. I can\u2019t quote a price here without those details.',
    source: 'legal.html (Terms of Use, "Quotes, payment and benefits"); booking-app.html'
  },
  {
    id: 'availability',
    topic: 'Availability',
    questions: [
      'Are you available?',
      'Are you available this week?',
      'Do you have availability?',
      'Can I check availability for my ride?',
      'Do you have any openings?',
      'Can you fit me in this week?',
      'Can I reserve a ride?'
    ],
    keywords: ['available', 'availability', 'openings', 'opening', 'same day', 'short notice', 'last minute', 'book ahead', 'fit me in', 'reserve', 'reservation'],
    answer:
      'Availability depends on the date, time, and trip, and I can\u2019t check live availability here \u2014 but it is confirmed for your specific trip as soon as you book online at https://mynexusride.com or call (888) 639-5766. Nexus\u2019s normal hours are Monday\u2013Friday, 7 AM\u20137 PM, and rides are scheduled in advance around appointment and treatment times, so booking ahead is the best way to secure your time. When you book, have the pickup and destination addresses, the appointment time, and any mobility or equipment needs ready \u2014 the trip is then matched to the right vehicle and crew, and booked trips can be followed in LiveCare.',
    source: 'booking-app.html; contact-service-areas.html (coverage depends on trip details and availability); non-emergency-medical-transportation.html (FAQPage JSON-LD: how far in advance to book); platform.js (site footer hours)'
  },
  {
    id: 'insurance-payer',
    topic: 'Payment and coverage',
    questions: ['Do you accept insurance?', 'Does Medicaid cover this?', 'Do you work with health plans or brokers?'],
    keywords: ['insurance', 'medicaid', 'medicare', 'coverage', 'payer', 'health plan', 'broker', 'pay for'],
    answer:
      'Whether a trip is covered depends on the passenger\u2019s payer and authorization — Nexus works with passengers, caregivers, facilities, health plans, and brokers, and the service level provided can depend on payer authorization. Call (888) 639-5766 with your situation and the team will confirm what applies to your trip. Please don\u2019t share personal or medical details with me here — the team can take those securely by phone.',
    source: 'legal.html (Terms of Use)'
  },
  {
    id: 'livecare',
    topic: 'LiveCare tracking',
    questions: ['Can I track my ride?', 'What is LiveCare?', 'How do I follow the trip status?'],
    keywords: ['track', 'tracking', 'livecare', 'live care', 'status', 'where is my ride', 'follow the ride', 'eta'],
    answer:
      'LiveCare is Nexus\u2019s ride-tracking view. Passengers and authorized caregivers can see the trip stage, assigned vehicle, estimated arrival, and a privacy-aware live route for the information they are authorized to view, at https://nexusmt.com/livecare.html. Family members can follow trip status through LiveCare once a trip is booked and tracking is enabled.',
    source: 'livecare.html; medical-transportation-annapolis.html (FAQPage JSON-LD)'
  },
  {
    id: 'caregivers',
    topic: 'Caregivers and facilities',
    questions: ['Can a caregiver book or coordinate a ride?', 'Can family members arrange transportation?', 'Can a caregiver ride along?'],
    keywords: ['caregiver', 'family', 'ride along', 'coordinate', 'arrange for someone else', 'parent', 'spouse'],
    answer:
      'Yes. Caregivers and family members can help set up trip details, coordinate rides for a passenger, and receive status updates. Authorized caregivers can also follow trip status through LiveCare. A person booking for someone else should be authorized to provide the passenger\u2019s information and request transportation.',
    source: 'non-emergency-medical-transportation.html (FAQPage JSON-LD); legal.html (Terms of Use)'
  },
  {
    id: 'facilities',
    topic: 'Caregivers and facilities',
    questions: ['Can facilities book transportation?', 'Do you work with hospitals and discharge planners?', 'Can a facility set up recurring transfers?'],
    keywords: ['facility', 'facilities', 'hospital', 'discharge planner', 'nursing', 'rehab center', 'clinic', 'partner'],
    answer:
      'Yes. Hospitals, rehabilitation centers, skilled nursing facilities, dialysis centers, and discharge teams can coordinate individual rides or set up ongoing arrangements and recurring transfers with Nexus. Facilities can start with the booking page or call (888) 639-5766.',
    source: 'ambulance-transportation.html (FAQPage JSON-LD); stretcher-transportation.html; contact-service-areas.html'
  },
  {
    id: 'contact',
    topic: 'Contact',
    questions: ['How do I contact you?', 'What is your phone number?', 'What is your email?'],
    keywords: ['contact', 'phone', 'number', 'email', 'call', 'reach'],
    answer:
      'You can reach Nexus Medical Transit on the main line at (888) 639-5766, on the Ambulance Services line at (888) 760-4990, or by email at contact@nexusmt.com. Nexus operates from Clarksburg, MD, serving Maryland, Washington, DC, and Northern Virginia.',
    source: 'contact-service-areas.html'
  },
  {
    id: 'emergency',
    topic: 'Emergencies',
    questions: ['Is this emergency transportation?', 'I need help right now'],
    keywords: ['emergency', '911', 'urgent', 'right now'],
    answer:
      'Nexus provides planned, non-emergency transportation only. If this is a medical emergency, call 911 immediately. For planned transportation, book at https://mynexusride.com or call (888) 639-5766.',
    source: 'ambulance-transportation.html (FAQPage JSON-LD); non-emergency-medical-transportation.html'
  },
  {
    id: 'privacy-hipaa',
    topic: 'Privacy',
    questions: ['How is my information handled?', 'Are you HIPAA compliant?', 'What is your privacy policy?'],
    keywords: ['privacy', 'hipaa', 'phi', 'health information', 'data', 'personal information'],
    answer:
      'Nexus\u2019s Legal & Privacy Center explains how personal and health-related information is handled, including its Privacy Policy, consumer health data protections, and HIPAA & PHI practices for when HIPAA applies. Please don\u2019t share personal or medical details with me — I don\u2019t collect or store them. For privacy questions, email contact@nexusmt.com or see the Legal & Privacy Center on this site.',
    source: 'legal.html'
  },
  {
    id: 'accessibility-info',
    topic: 'Accessibility',
    questions: ['Is the website accessible?', 'Do you have accessibility options?'],
    keywords: ['accessibility', 'accessible', '508', 'screen reader', 'large text', 'high contrast'],
    answer:
      'This website includes an accessibility options control (the 508 button) with larger text, high contrast, and reduced motion settings, and Nexus publishes an accessibility statement on this site. If you need help using the site or booking, call (888) 639-5766 and the team will assist you directly.',
    source: 'accessibility.html; platform.js (Section 508 options)'
  }
];

module.exports = { CONTACT, ENTRIES };
