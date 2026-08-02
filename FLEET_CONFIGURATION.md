# Nexus Fleet Configuration

## Overview
Nexus Medical Transit operates a **4-tier vehicle fleet** designed to match patient mobility needs with appropriate transport modes. All vehicles are **24/7 available** for dispatch.

**Fleet Architecture Based On**: AMR (American Medical Response), Guardian EMS, American Ambulance best practices

---

## Fleet Inventory

### TIER 1: Sedan (254-01)
**Vehicle**: 2024 Toyota Camry Hybrid  
**Unit ID**: 254-01  
**Status**: Available 24/7  
**Service Class**: Personal Transport

| Specification | Value |
|---|---|
| **Passenger Capacity** | 2 |
| **Wheelchair Capacity** | 0 |
| **Fuel Type** | Hybrid (52 MPG) |
| **Accessibility** | Wheelchair ramp |
| **Primary Services** | Ambulatory transport |
| **Equipment** | First aid kit, emergency flashers, premium audio |
| **GPS/Telematics** | Yes, real-time tracking |
| **Backup Camera** | Yes |
| **Inspection Valid Until** | 2027-08-02 |
| **Insurance Valid Until** | 2027-02-01 |
| **Maintenance Interval** | Every 10,000 miles |

**Best For**: Ambulatory patients, single or couple transport, fuel efficiency priority  
**Service Match**: Ambulatory-only trips  
**Driver Certification**: Standard driver's license  

---

### TIER 2: SUV (254-02)
**Vehicle**: 2024 Ford Expedition (Premium)  
**Unit ID**: 254-02  
**Status**: Available 24/7  
**Service Class**: Premium Passenger Transport

| Specification | Value |
|---|---|
| **Passenger Capacity** | 3 |
| **Wheelchair Capacity** | 0 |
| **Fuel Type** | Gasoline (23 MPG) |
| **Accessibility** | Wheelchair ramp, fold-down seating, grab handles |
| **Comfort Features** | Heated/ventilated seats, memory position, climate control |
| **Primary Services** | Ambulatory + light wheelchair |
| **Equipment** | First aid kit, patient communication system, wheel chair securements |
| **GPS/Telematics** | Yes, real-time tracking |
| **Collision Avoidance** | Yes (blind spot monitoring, adaptive cruise) |
| **Inspection Valid Until** | 2027-08-02 |
| **Insurance Valid Until** | 2027-02-01 |
| **Maintenance Interval** | Every 7,500 miles |

**Best For**: Multi-passenger comfort, elderly/disabled patients, moderate accessibility needs  
**Service Match**: Ambulatory + wheelchair (light duty)  
**Driver Certification**: Commercial driver's license + passenger endorsement  
**Additional Features**: Advanced suspension, premium safety systems  

---

### TIER 3: Wheelchair Accessible Van (254-03)
**Vehicle**: 2024 Ford Transit 350 HD  
**Unit ID**: 254-03  
**Status**: Available 24/7  
**Service Class**: Advanced Wheelchair Accessible Transport

| Specification | Value |
|---|---|
| **Passenger Capacity** | 12 (including 3 wheelchair slots) |
| **Wheelchair Capacity** | 3 (independent + group transport) |
| **Wheelchair Weight Limit** | 350 lbs per slot |
| **Stretcher Capacity** | 0 (medical equipment not included) |
| **Fuel Type** | Diesel (18 MPG) |
| **Engine** | 6.7L, 470 HP, TorqShift 10-speed |
| **ADA Compliant** | Yes (AOA certified) |
| **Accessibility Features** | Hydraulic side ramp, rear wheelchair lift, 3x auto-lock securements, emergency hatch |
| **Interior** | Full-height (6'9"), wider aisles, grab handles throughout |
| **Climate Control** | Zone-based for passenger comfort |
| **Primary Services** | Wheelchair transport, facility transfers, mixed-mobility groups |
| **Equipment** | Advanced first aid, oxygen system, suction, patient communication intercom |
| **GPS/Telematics** | Yes, 360° camera system |
| **Safety Systems** | Blind spot monitoring, lane departure warning, traction/stability control |
| **Inspection Valid Until** | 2027-08-02 |
| **Insurance Valid Until** | 2027-02-01 |
| **Maintenance Interval** | Every 5,000 miles |

**Best For**: Multi-passenger wheelchair transport, facility relocations, high-volume mobility groups  
**Service Match**: Wheelchair + ambulatory, facility transfer, group transport  
**Driver Certification**: CDL Class B + passenger endorsement + ADA training + wheelchair transport certification  
**Special Notes**: Ideal for healthcare facilities, group homes, senior centers  

---

### TIER 4: Ambulance (254-04)
**Vehicle**: 2024 Braun Chief XL Ambulance  
**Unit ID**: 254-04  
**Status**: Available 24/7  
**Service Class**: Advanced Life Support Emergency Transport

| Specification | Value |
|---|---|
| **Patient Capacity** | 1 stretcher + 2 ambulatory attendants |
| **Patient Compartments** | 1 (fully equipped) |
| **Attendant Seating** | 2 (captain's chairs) |
| **Stretcher Weight Limit** | 350 lbs |
| **Fuel Type** | Gasoline (14 MPG) |
| **Engine** | 6.8L, 362 HP, TorqShift automatic |
| **Certification Level** | **ALS 2** (Advanced Life Support Level 2) |
| **Medical Equipment** | Defibrillator, cardiac monitor, IV pump, high-flow oxygen, suction, ventilator, airway kit, spinal board, trauma supplies |
| **Monitoring Capability** | Automated stretcher loading, shock absorption suspension, climate control patient zone |
| **Emergency Response** | LED lights, multi-tone siren, reflective striping, emergency radio |
| **Mobile Data Terminal** | Yes (vehicle routing, dispatch integration) |
| **GPS/Telematics** | Advanced with 360° camera, collision avoidance, automatic braking |
| **Telemedicine Capable** | Yes (remote monitoring, video consultation) |
| **ICT Capable** | Yes (inter-facility critical transport) |
| **Inspection Valid Until** | 2027-08-02 |
| **Medical Equipment Inspection** | 2027-04-01 |
| **Insurance Valid Until** | 2027-02-01 |
| **Maintenance Interval** | Every 3,000 miles |
| **Equipment Certification** | NFPA 1917 (ambulance standards) |

**Best For**: Critical care transport, hospital transfers, emergency scenarios, high-acuity patients  
**Service Match**: Stretcher transport, ALS 2 scenarios, facility transfers (critical), emergency response  
**Driver Certification**: CDL Class B + passenger endorsement + ALS 2 transport certification + emergency response training + HIPAA certified  
**Special Notes**: Full medical equipment set, emergency-response ready, telemedicine integration  

---

## Dispatch Routing Logic

### Service-to-Vehicle Assignment

```
AMBULATORY PATIENT (walking/minor assistance)
└─ Primary: Sedan (254-01) - efficient, direct
└─ Secondary: SUV (254-02) - more comfort
└─ Fallback: Wheelchair Van (254-03) - if others unavailable

WHEELCHAIR PATIENT (mobility device required)
└─ Primary: Wheelchair Van (254-03) - full accessibility
└─ Secondary: SUV (254-02) - if single passenger
└─ Not Suitable: Sedan, Ambulance

MULTIPLE WHEELCHAIR PATIENTS (2-3 wheelchairs)
└─ Primary: Wheelchair Van (254-03) - designed for groups
└─ Not Suitable: All others

STRETCHER/CRITICAL PATIENT (bedridden, medical support)
└─ Primary: Ambulance (254-04) - ALS 2 capable
└─ Not Suitable: All others

BARIATRIC PATIENT (350+ lbs, specialized equipment)
└─ Primary: Ambulance (254-04) - rated for weight
└─ Secondary: Wheelchair Van (254-03) - reinforced suspension
└─ Not Suitable: Sedan, SUV

FACILITY TRANSFER (hospital to facility/home)
└─ Ambulatory: Sedan → SUV → Wheelchair Van
└─ Stretcher: Ambulance (ALS 2)
└─ Mixed Group: Wheelchair Van (254-03)

EMERGENCY CALL (911 response, critical)
└─ Primary: Ambulance (254-04) - emergency certified
└─ Not Suitable: Others
```

---

## Vehicle Features & Standards

### GPS & Telematics (All Vehicles)
- **Real-time GPS tracking**: Live location, route optimization
- **Backup systems**: Cellular + satellite fallback
- **Driver notifications**: Dispatch alerts, turn-by-turn navigation
- **Fleet monitoring**: Speed, acceleration, braking patterns
- **Data retention**: 30 days minimum

### Safety Systems (All Vehicles)
- **Electronic stability control**: Prevents loss of control
- **Traction control**: Grip optimization on all road conditions
- **Backup cameras**: All vehicles
- **360° camera system**: Wheelchair Van, Ambulance
- **Blind spot monitoring**: SUV, Wheelchair Van, Ambulance
- **Advanced collision avoidance**: SUV, Ambulance
- **Automatic emergency braking**: Ambulance

### Accessibility Compliance
- **ADA Standards**: Wheelchair Van (254-03) fully compliant, AOA certified
- **Wheelchair Ramp**: Sedan, SUV, Wheelchair Van
- **Auto-locking securements**: 3 on Wheelchair Van
- **Grab handles**: Throughout Wheelchair Van interior
- **Emergency exits**: Wheelchair Van rear hatch

### Maintenance & Inspection
- **Regular intervals**: 3,000–10,000 miles per vehicle class
- **Annual inspections**: Valid through 2027-08-02 (all vehicles)
- **Insurance coverage**: Valid through 2027-02-01 (all vehicles)
- **Medical equipment (Ambulance)**: Quarterly certification, NFPA 1917 compliance

---

## Operator Requirements by Vehicle

### Tier 1: Sedan (254-01)
- Standard driver's license
- 3+ years driving experience
- Clean driving record
- Background check clearance

### Tier 2: SUV (254-02)
- Commercial driver's license (CDL)
- Passenger endorsement
- 5+ years professional driving
- Safe driving record
- Customer service training

### Tier 3: Wheelchair Van (254-03)
- CDL Class B
- Passenger endorsement
- **Wheelchair transport certification** (mandatory)
- ADA compliance training (mandatory)
- 7+ years professional driving
- Advanced safety course
- Defensive driving certification

### Tier 4: Ambulance (254-04)
- CDL Class B
- Passenger endorsement
- **ALS 2 transport certification** (mandatory)
- Emergency response training (mandatory)
- Medical equipment operation certification (mandatory)
- HIPAA certification (mandatory)
- First Aid/CPR certification (current)
- 10+ years professional driving or 3+ years medical transport
- Annual medical equipment competency review

---

## Dispatch Availability

### 24/7 Fleet Coverage
All four vehicles are available every day, every hour:
- **Weekdays (Mon-Fri)**: 00:00–23:59
- **Weekends (Sat-Sun)**: 00:00–23:59
- **Holidays**: Full availability
- **Shift Handoff**: Seamless (no shift gaps)
- **On-Call Floater**: Fletcher Kalundi covers all vehicle types

### Peak-Hour Optimization
- **Rush Hours (7-9 AM, 4-6 PM)**: All 4 vehicles active
- **Mid-Day (10 AM-3 PM)**: 3 vehicles active (Sedan + SUV + Van OR Ambulance on demand)
- **Night (9 PM-7 AM)**: 2 vehicles active (Sedan + Ambulance OR Van + Ambulance)
- **Dynamic Allocation**: Real-time dispatch system reassigns based on demand

---

## Cost Model & Service Tiers

### Rate Calculation (Per Mile)
| Vehicle | Base Rate | Per Mile | Wheelchair Surcharge |
|---|---|---|---|
| Sedan (254-01) | $25 | $1.50 | N/A |
| SUV (254-02) | $35 | $2.00 | $10 |
| Wheelchair Van (254-03) | $50 | $2.50 | $5 each (max $15) |
| Ambulance (254-04) | $125 | $3.50 | N/A (included) |

**Wait Time**: $0.50/minute (all vehicles)  
**Return Trip Premium**: 25% of outbound fare  

---

## Integration Points

### Dispatch System
- Real-time vehicle availability
- GPS-based routing optimization
- Automatic vehicle selection by patient type
- Driver assignment with skill matching

### Driver App (`/driver.html`)
- Real-time trip assignments
- Navigation integration (Google Maps)
- Patient communication
- Status updates
- Mileage logging

### Booking System (`/booking-app.html`)
- Vehicle selection UI (where applicable)
- ETA calculation
- Accessibility requirement matching
- Rate transparency

### Admin Dashboard (`/admin.html`)
- Fleet health monitoring
- Maintenance scheduling
- Driver certification tracking
- Compliance reporting

---

## Compliance & Certifications

### Regulatory Standards
- **NFPA 1917**: Ambulance vehicle standards (254-04)
- **ADA Title II**: Wheelchair accessibility (254-03)
- **DOT Regulations**: Commercial driver requirements
- **OSHA**: Occupational Safety requirements
- **HIPAA**: Patient privacy (all vehicles with patient transport)

### Insurance & Liability
- General liability: $1M
- Professional liability: $1M
- Vehicle insurance: Comprehensive + collision
- Workers compensation: All staff

### Audit Trail
- Trip logs: Booking reference, pickup/destination, mileage, duration
- Driver logs: Shift start/end, vehicle assignment, trip count
- Maintenance logs: Service dates, issues, resolutions
- Inspection records: Annual certifications, results

---

## Fleet Setup Instructions

### 1. Apply Migration
```bash
npm run db:migrate
```
Creates vehicle records with full metadata (specifications, equipment, certifications).

### 2. Seed Vehicles into Database
```bash
npm run fleet:seed
```
Initializes all 4 vehicles with AVAILABLE status and GPS coordinates.

### 3. Verify Fleet
```bash
npm run db:check
```
Confirms all vehicles are active and dispatch-ready.

### 4. Test Dispatch Assignment
- Navigate to `/dispatch.html`
- Submit a trip with patient type
- Verify correct vehicle is suggested

---

## Fleet Monitoring Dashboard

### Real-Time Metrics
- **Active Vehicles**: Count by status (available, dispatched, maintenance)
- **Response Times**: Average ETA by service tier
- **Utilization Rate**: Miles/trips per vehicle per day
- **Maintenance Schedule**: Upcoming services by vehicle
- **Driver Certifications**: Expiry dates and renewal status

### Monthly Reports
- **Fuel Consumption**: Miles per gallon, cost per mile
- **Maintenance Costs**: By vehicle and service type
- **Trip Volume**: By service tier and patient type
- **Safety Incidents**: Accidents, violations, near-misses
- **Compliance Status**: Inspection, insurance, certification status

---

## Industry Best Practices Implemented

✓ **Multi-Tier Vehicle Strategy**: Right-sized vehicles for each service level  
✓ **24/7 Availability**: No shift gaps, seamless on-call coverage  
✓ **Advanced Safety**: GPS, telematics, collision avoidance, backup systems  
✓ **Accessibility Standards**: ADA compliance, wheelchair securements, emergency systems  
✓ **Medical Equipment**: Full ALS 2 capability on ambulance, oxygen/suction on van  
✓ **Operator Training**: Role-specific certifications, annual recertification  
✓ **Compliance Tracking**: Automated inspection, insurance, and certification reminders  
✓ **Data Integration**: Trip logs, driver logs, maintenance records, GPS history  

---

## Contact & Support

**Fleet Manager**: operations@nexusmt.com  
**Maintenance Issues**: maintenance@nexusmt.com  
**Driver Assignments**: dispatch@nexusmt.com  

---

**Fleet Created**: 2026-08-02  
**Status**: Ready for 24/7 dispatch  
**Last Updated**: 2026-08-02  
**Migration**: 053.001_add_comprehensive_fleet.sql  
**Seeding Script**: seed-fleet.mjs
