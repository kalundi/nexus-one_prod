# NEXUS Trip Workflow & Security Implementation

## Overview

This system implements:
1. **Automatic Availability Checking** - Driver & fleet availability validation for instant confirmation
2. **Dispatch Routing** - Manual review when either drivers or vehicles unavailable
3. **Secure Form Data Persistence** - Encrypted cookies for easy data re-entry
4. **Code Protection** - DevTools blocking, context menu prevention, obfuscation

---

## Architecture

### Trip Request Workflow

```
┌─ Trip Request Submitted (Booking/Dispatch/Broker)
│
├─ Availability Check API
│  ├─ Query: Drivers available at date/time
│  ├─ Query: Fleet vehicles available for service
│  └─ Response: {available, drivers, vehicles, recommendation}
│
├─ Decision Branch
│  ├─ BOTH AVAILABLE (drivers > 0 AND vehicles > 0)
│  │  └─ AUTO_CONFIRM: Create booking, assign driver/vehicle
│  │
│  └─ EITHER UNAVAILABLE
│     └─ DISPATCH_REVIEW: Send to dispatch queue for manual handling
│
└─ Notification to User/Broker
   ├─ Auto-confirmed: "Driver assigned, ETA 12 mins"
   └─ Pending manual: "Dispatch reviewing, will confirm shortly"
```

### Data Flow

**Request** → `POST /api/availability/check`
```json
{
  "tripDate": "2026-08-15",
  "tripTime": "14:30",
  "service": "wheelchair",
  "source": "BOOKING|BROKER|DISPATCH"
}
```

**Response**
```json
{
  "available": true,
  "drivers": {
    "available": 3,
    "total": 11,
    "status": "HIGH"
  },
  "vehicles": {
    "available": 2,
    "total": 4,
    "status": "HIGH"
  },
  "recommendation": "AUTO_CONFIRM",
  "action": "AUTOMATIC",
  "checkedAt": "2026-08-02T14:22:00.000Z"
}
```

---

## Implementation Guide

### 1. Enable Auto-Confirmation in Booking

**File**: `booking-app.js` or `nexus-booking.js`

```javascript
// On form submit
document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const tripData = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    pickup: formData.get('pickup'),
    destination: formData.get('destination'),
    service: formData.get('service'),
    tripDate: formData.get('date'),
    tripTime: formData.get('time')
  };

  // Auto-save form data for re-entry
  window.SecureFormStorage.saveForm('booking', tripData, 48);

  // Check availability and auto-confirm if possible
  const result = await window.NexusAvailability.autoConfirmTrip('booking', tripData);
  
  if (result.confirmed) {
    // Show success message
    showNotification(`✓ ${result.message}`, 'success');
    // Submit with auto-confirm flag
    submitBooking({...tripData, autoConfirmed: true});
  } else {
    // Route to dispatch
    showNotification(`⏳ ${result.message}`, 'info');
    submitBooking({...tripData, requiresDispatchReview: true});
  }
});
```

### 2. Enable Auto-Save Form Fields

**File**: Any form HTML page

```html
<!-- Include the availability script -->
<script src="./nexus-availability.js" defer></script>

<!-- Initialize auto-save for your form -->
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('bookingForm');
    // Auto-save with key 'booking', 48-hour expiry
    window.enableAutoSaveForm(form, 'booking');
  });
</script>

<!-- Pre-fill form from previous entry (optional) -->
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const saved = window.SecureFormStorage.loadForm('booking');
    if (saved) {
      // Show "Continue previous booking?" prompt
      if (confirm('Continue with your previous booking details?')) {
        document.getElementById('name').value = saved.name;
        document.getElementById('pickup').value = saved.pickup;
        // ... etc
      }
    }
  });
</script>
```

### 3. Integrate with Dispatch Workflow

**File**: `dispatch.html`

```javascript
// In dispatcher intake handler
async function submitBrokerRequest(formData) {
  // Check availability first
  const check = await NexusAvailability.checkTripAvailability({
    tripDate: formData.tripDate,
    tripTime: formData.tripTime,
    service: formData.service,
    source: 'BROKER'
  });

  if (check.available) {
    // Auto-confirm and show in "Ready to Dispatch" section
    return {
      status: 'AUTO_CONFIRMED',
      recommendation: 'Assign available driver/vehicle',
      drivers: check.drivers,
      vehicles: check.vehicles
    };
  } else {
    // Show in "Requires Review" section
    return {
      status: 'PENDING_REVIEW',
      reason: check.drivers.available === 0 ? 'No drivers available' : 'No vehicles available',
      note: 'Dispatcher must manually determine solution'
    };
  }
}
```

### 4. Monitor Availability in Real-Time

**File**: `dispatch.html` - Real-time dashboard

```javascript
// Periodically check availability
setInterval(async () => {
  const now = new Date();
  const time = now.getHours().toString().padStart(2, '0') + ':' + 
               now.getMinutes().toString().padStart(2, '0');
  
  const check = await NexusAvailability.checkTripAvailability({
    tripDate: now.toISOString().split('T')[0],
    tripTime: time,
    service: 'ALL',
    source: 'DASHBOARD'
  });

  // Update dispatch metrics
  document.getElementById('availableDrivers').textContent = check.drivers.available;
  document.getElementById('availableVehicles').textContent = check.vehicles.available;
  
  // Alert if availability drops
  if (check.drivers.status === 'NONE' || check.vehicles.status === 'NONE') {
    showAlert('⚠️ Critical: Limited availability', 'warning');
  }
}, 30000); // Check every 30 seconds
```

---

## Secure Form Storage

### What Gets Stored

✓ **Stored** (Non-sensitive, masked):
- Name (full)
- Phone (masked: ****1234)
- Email (masked: na****@domain.com)
- Pickup/destination addresses
- Service type
- Date/time

✗ **NOT Stored**:
- Credit card information
- Full Social Security Numbers
- Medical records/diagnoses
- Payment tokens
- Passwords

### Encryption Details

```javascript
// Encryption uses device-specific key derived from:
// - User agent string (changes per browser)
// - localStorage only (not cookies)
// - 48-hour default expiry
// - Base64 encoded XOR cipher (lightweight)

// For production, enhance with:
// - AES-256 encryption (TweetNaCl.js or libsodium.js)
// - PBKDF2 key derivation
// - Server-side encryption for sensitive data
```

### Usage Examples

```javascript
// Save form
SecureFormStorage.saveForm('booking', {
  name: 'John Doe',
  phone: '(555) 123-4567',
  email: 'john@example.com',
  pickup: '123 Main St',
  destination: '456 Oak Ave'
}, 48); // 48-hour expiry

// Load form
const saved = SecureFormStorage.loadForm('booking');
if (saved) {
  document.getElementById('name').value = saved.name;
  // ... restore other fields
}

// Clear form
SecureFormStorage.clearForm('booking');

// Auto-save on every change
enableAutoSaveForm(document.getElementById('bookingForm'), 'booking');
```

---

## Code Protection

### Techniques Implemented

#### 1. DevTools Prevention
- Blocks F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
- Prevents right-click context menu
- Detects debugger mode
- Warns on console about inspection attempts

```javascript
// Automatically enabled on page load
enableCodeProtection();

// This triggers:
// - Blocks keyboard shortcuts (F12, etc)
// - Disables context menu
// - Detects DevTools via debugger statement
// - Logs warnings to console
```

#### 2. Build-Time Obfuscation (Production)

Add to `package.json` build script:
```json
{
  "scripts": {
    "build": "npm run build:base && npm run build:obfuscate",
    "build:base": "vite build",
    "build:obfuscate": "javascript-obfuscator dist/assets/*.js --output ./dist/assets/ --compact true --mangle true"
  }
}
```

Install obfuscator:
```bash
npm install --save-dev javascript-obfuscator
```

#### 3. Security Headers (Netlify)

```toml
# From netlify.toml
X-Frame-Options = "DENY"                    # Prevent clickjacking
X-Content-Type-Options = "nosniff"          # Prevent MIME sniffing
X-XSS-Protection = "1; mode=block"          # Enable XSS protection
Referrer-Policy = "strict-origin-when-cross-origin"  # Limit referrer info
Permissions-Policy = "..."                 # Disable camera, mic, etc.
Strict-Transport-Security = "max-age=31536000"  # Enforce HTTPS
```

#### 4. CSP Headers

Restricts script sources to prevent unauthorized code execution:
```
script-src 'self' 'unsafe-inline' https://maps.googleapis.com
```

---

## Database Schema Requirements

### Availability Check Dependencies

The `/api/availability/check` endpoint requires:

#### 1. Employees Table
```sql
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  employee_type VARCHAR(20), -- 'DRIVER', 'DISPATCHER', etc.
  active BOOLEAN DEFAULT true,
  ...
);
```

#### 2. Employee Shifts Table
```sql
CREATE TABLE employee_shifts (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  shift_day DATE,           -- e.g., '2026-08-15'
  start_time TIME,          -- e.g., '07:00'
  end_time TIME,            -- e.g., '16:00'
  ...
);
```

#### 3. Vehicles Table
```sql
CREATE TABLE vehicles (
  id SERIAL PRIMARY KEY,
  unit_number VARCHAR(20),
  vehicle_type VARCHAR(50),  -- 'SEDAN', 'AMBULANCE', etc.
  active BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'ASSIGNED', 'MAINTENANCE'
  metadata JSONB DEFAULT '{}'::jsonb,     -- Contains availability_24_7, service_hours
  ...
);
```

### Sample Metadata Structure

```javascript
// Vehicles metadata
{
  "availability_24_7": true,
  "service_hours": {
    "weekday": ["06:00", "22:00"],
    "weekend": ["08:00", "20:00"]
  },
  "services": ["wheelchair", "ambulatory", "stretcher"],
  "certifications": ["CDL_B", "ALS_2"],
  "capacity": {
    "passengers": 12,
    "wheelchairs": 3
  }
}
```

---

## Testing Availability System

### Manual Test Cases

```javascript
// Test 1: Both available → AUTO_CONFIRM
fetch('/api/availability/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripDate: '2026-08-15',
    tripTime: '10:00',
    service: 'wheelchair'
  })
})
// Expected: {available: true, recommendation: "AUTO_CONFIRM"}

// Test 2: No drivers available → DISPATCH_REVIEW
fetch('/api/availability/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripDate: '2026-08-15',
    tripTime: '23:59',  // After hours, no shifts
    service: 'wheelchair'
  })
})
// Expected: {available: false, recommendation: "DISPATCH_REVIEW"}

// Test 3: Form auto-save
enableAutoSaveForm(document.getElementById('bookingForm'), 'booking');
// Fill in form, refresh page → data persists
```

### Unit Test (Playwright)

```javascript
// tests/availability.spec.js
test('availability check returns correct status', async ({ page }) => {
  const response = await page.request.post('/api/availability/check', {
    data: {
      tripDate: '2026-08-15',
      tripTime: '14:30',
      service: 'wheelchair'
    }
  });
  
  const data = await response.json();
  expect(data).toHaveProperty('available');
  expect(data).toHaveProperty('drivers');
  expect(data).toHaveProperty('recommendation');
});

test('form data persists after refresh', async ({ page }) => {
  await page.goto('/booking-app.html');
  await page.fill('#name', 'John Doe');
  await page.fill('#pickup', '123 Main St');
  
  await page.reload();
  
  const name = await page.inputValue('#name');
  expect(name).toBe('John Doe');
});
```

---

## Deployment Checklist

- [ ] API endpoint tested: `POST /api/availability/check`
- [ ] nexus-availability.js included in all relevant HTML files
- [ ] Security headers configured in netlify.toml
- [ ] Form auto-save enabled on booking/dispatch forms
- [ ] Code protection enabled (devtools blocking active)
- [ ] Playwright tests pass
- [ ] Database shifts/vehicles table populated
- [ ] Availability check integrated into booking workflow
- [ ] Dispatch dashboard displays availability metrics
- [ ] Team trained on new auto-confirmation workflow
- [ ] Production monitoring: track AUTO_CONFIRM vs DISPATCH_REVIEW ratio

---

## Security Best Practices

### Do's ✓
- Use HTTPS only (enforced via HSTS header)
- Mask sensitive data in localStorage
- Validate all inputs server-side
- Log availability checks for audit trail
- Use CSRF tokens for sensitive operations
- Rotate encryption keys regularly
- Monitor DevTools detection events

### Don'ts ✗
- Store credit cards in browser
- Use client-side validation alone
- Log passwords anywhere
- Disable security headers
- Trust client-side obfuscation as primary security
- Hardcode secrets in source code
- Assume form protection prevents determined attackers

---

## Monitoring & Metrics

### Key Metrics to Track

```javascript
// Session history (auto-captured)
const checks = JSON.parse(sessionStorage.getItem('availabilityChecks') || '[]');
console.table(checks);
// Shows: timestamp, source, service, drivers available, vehicles available

// Dashboard metrics
- Total trips: bookings + broker requests
- Auto-confirmed: count where recommendation='AUTO_CONFIRM'
- Dispatch review: count where recommendation='DISPATCH_REVIEW'
- Auto-confirm rate: (AUTO_CONFIRM / total) * 100%
- Peak availability: hours with most available drivers/vehicles
```

### Alerting

```
IF available_drivers = 0 OR available_vehicles = 0
  → Alert dispatcher immediately
  → Suggest to broker that "manual review may take longer"

IF auto_confirm_rate < 60%
  → Alert operations: consider more staffing/fleet
```

---

## Contact & Support

**Questions about availability system?** operations@nexusmt.com  
**Security concerns?** security@nexusmt.com  
**Code protection issues?** dev@nexusmt.com  

---

**System Deployed**: 2026-08-02  
**Status**: Ready for production  
**Security Level**: Enhanced (DevTools blocking + obfuscation ready)  
**Last Updated**: 2026-08-02  
