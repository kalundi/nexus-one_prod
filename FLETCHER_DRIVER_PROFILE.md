# Fletcher Kalundi - Floater Driver Profile

## Overview
Fletcher Kalundi is a **24/7 on-call floater driver** for Nexus Medical Transit. Floater drivers are senior personnel who provide flexible, on-demand coverage across all service levels and vehicle types without fixed shift schedules.

---

## Personal Details
| Field | Value |
|-------|-------|
| **Name** | Fletcher Kalundi |
| **Employee Code** | NEXF001 |
| **Email** | fletcher@nexusmt.com |
| **Phone** | (202) 315-9253 |
| **Role** | Driver (DRIVER) |
| **Status** | Active |
| **Unit Number** | FLT-24H (Floater 24-Hour) |
| **Timezone** | America/New_York |

---

## Credentials & Certifications
### Driver's License
- **Number**: MD-4827-555-334
- **State**: Maryland (MD)
- **Expiry Date**: 2027-08-15
- **Status**: Valid ✓

### Medical Examiner's Certificate
- **Required for**: Commercial medical transport operations
- **Status**: Valid ✓
- **Expiry Date**: 2026-12-20
- **Regulatory Requirement**: DOT Physical examination

### CDL & Certifications
- **CDL Class**: B (Commercial Driver's License)
- **DOT Medical Certificate**: Active
- **First Aid & CPR**: Current
- **Defensive Driving**: Certified
- **HIPAA Compliance**: Certified
- **Vehicle Inspection**: Certified

---

## Vehicle Skills
Certified to operate and maintain:
- Wheelchair-accessible vans (all configurations)
- Stretcher transport vehicles
- Bariatric lift equipment
- Hydraulic lift systems

---

## Service Skills
Qualified to provide:
- **Wheelchair Transport**: Standard medical wheelchair transport
- **Stretcher Transport**: Secured stretcher operations for mobility-impaired patients
- **Ambulatory Services**: Walking-capable patient pickup and delivery
- **Bariatric Services**: Heavy-duty equipment and careful patient handling (up to 500+ lbs)
- **ALS Level 2 Transport**: Advanced Life Support scenario readiness
- **Facility Transfer**: Inter-facility patient relocations with specialized training

---

## Additional Skills
- **Bilingual Spanish**: Fluent in Spanish for patient communication
- **Customer Service Excellence**: Senior-level professionalism and patient care
- **Adaptive Equipment Expert**: Advanced knowledge of mobility aids and accessibility systems

---

## Employment Terms
- **Employment Type**: Floater (On-Call)
- **Availability**: 24/7/365
- **Shift Schedule**: No fixed hours—responds to dispatch calls
- **Coverage Model**: Primary backup for peak demand and emergency situations

### Shift Configuration
- **Monday-Sunday**: 00:00 – 23:59 (full day coverage, every day)
- **Assignment Role**: DRIVER
- **Status**: Active on all days

---

## System Access
| Credential | Value |
|-----------|-------|
| **Login Email** | fletcher@nexusmt.com |
| **Initial Password** | Fletcher2026! |
| **Portal** | Driver Workspace (/driver.html) |
| **Access Level** | Dispatch assignment, trip execution, status updates |

**Action**: Change password on first login.

---

## Industry Standards Met
✓ **DOT Compliance**: Valid medical certificate and driving record  
✓ **HIPAA Compliance**: Patient privacy training and certification  
✓ **Vehicle Certification**: Multi-type vehicle operation permitted  
✓ **Service Level Coverage**: Qualified across wheelchair, stretcher, ambulatory, bariatric, and ALS transport  
✓ **Emergency Readiness**: Defensive driving and first aid certifications  
✓ **Customer Communication**: Bilingual capability for diverse patient needs  

---

## Dispatch Notes
- **Primary Role**: Senior floater driver for flexible dispatch coverage
- **Best For**: Peak-hour backup, emergency call-outs, multi-service trip routing
- **Communication**: Responsive to text and in-app dispatch notifications
- **Equipment Comfort**: Experienced with all vehicle types and accessibility equipment

---

## Creation Details
- **Created By**: Platform migration 052.001
- **Created Date**: 2026-08-02
- **Last Updated**: 2026-08-02
- **Migration**: `052.001_add_fletcher_kalundi_floater_driver.sql`
- **Script**: `add-fletcher-driver.mjs`

---

## Setup Instructions

### 1. Apply Migration
```bash
npm run db:migrate
```

### 2. Create Fletcher's User Account
```bash
npm run driver:add-fletcher
```

### 3. Verify Setup
```bash
npm run db:check
```

### 4. Test Login
- Navigate to `/livecare.html` or login endpoint
- Email: `fletcher@nexusmt.com`
- Password: `Fletcher2026!`
- Expected role: DRIVER

---

## Floater Driver Model

### What is a Floater Driver?
Floater drivers (also called "on-call" or "utility" drivers) provide flexible coverage without fixed schedules. They're typically:
- Senior operators with multi-vehicle expertise
- Available for emergency and peak-demand periods
- Assigned on an as-needed basis by dispatch
- Capable of handling any service level

### Why Floater Drivers?
1. **Flexibility**: Cover gaps in fixed schedules
2. **Peak Management**: Handle surge demand without full-time hiring
3. **Resilience**: Provide redundancy for system reliability
4. **Quality**: Usually experienced drivers with advanced skills

### Shift Logic
- **Fixed drivers**: Assigned to specific weekday/time slots (e.g., Mon-Fri 9 AM-5 PM)
- **Floater drivers**: 24/7 availability means they appear in all dispatch pools across all times
- **Assignment**: Dispatch system selects based on real-time availability and trip requirements

---

## Contact & Support
For updates to Fletcher's profile or credentials, update:
- **Database**: `employees` table (employee_code = 'NEXF001')
- **User Account**: `users` table (email = fletcher@nexusmt.com)
- **Shifts**: `employee_shifts` table (filter by employee_id)

---

**Status**: Ready for dispatch  
**Last Verified**: 2026-08-02
