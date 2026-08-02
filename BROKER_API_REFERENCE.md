# Broker System API Reference

## Authentication
All endpoints require Bearer token in `Authorization` header.

```bash
Authorization: Bearer YOUR_TOKEN
```

---

## Broker Management

### Create Broker
```http
POST /api/admin/brokers
Content-Type: application/json

{
  "name": "ABC Transport Inc.",
  "contact_email": "broker@abc-transport.com",
  "contact_person": "John Broker",
  "contact_phone": "+1-555-123-4567",
  "net_terms_days": 30,
  "notes": "Nationwide coverage, excellent track record"
}
```

**Response (201)**:
```json
{
  "broker": {
    "id": 1,
    "name": "ABC Transport Inc.",
    "contact_email": "broker@abc-transport.com",
    "contact_person": "John Broker",
    "contact_phone": "+1-555-123-4567",
    "net_terms_days": 30,
    "status": "ACTIVE",
    "created_at": "2026-08-02T14:30:00Z",
    "updated_at": "2026-08-02T14:30:00Z"
  }
}
```

---

### List All Brokers
```http
GET /api/admin/brokers
```

**Response (200)**:
```json
{
  "brokers": [
    {
      "id": 1,
      "name": "ABC Transport Inc.",
      "contact_email": "broker@abc-transport.com",
      "status": "ACTIVE",
      "net_terms_days": 30,
      "created_at": "2026-08-02T14:30:00Z"
    },
    { ... }
  ]
}
```

---

### Get Broker Details (with current rates)
```http
GET /api/admin/brokers/1
```

**Response (200)**:
```json
{
  "broker": {
    "id": 1,
    "name": "ABC Transport Inc.",
    "contact_email": "broker@abc-transport.com",
    "contact_person": "John Broker",
    "contact_phone": "+1-555-123-4567",
    "net_terms_days": 30,
    "status": "ACTIVE"
  },
  "rates": [
    {
      "id": 5,
      "broker_id": 1,
      "service": "MEDICAL_TRANSPORT",
      "base_rate": 50.00,
      "per_mile_rate": 2.50,
      "notes": "Standard rate for 2026",
      "effective_from": "2026-01-01T00:00:00Z",
      "effective_to": null
    },
    { ... }
  ]
}
```

---

### Update Broker
```http
PATCH /api/admin/brokers/1
Content-Type: application/json

{
  "contact_person": "Jane Broker",
  "contact_phone": "+1-555-999-8888",
  "net_terms_days": 45,
  "notes": "Updated contact information"
}
```

**Response (200)**:
```json
{
  "broker": { ... updated broker object ... }
}
```

---

## Broker Rates

### Add/Update Broker Rate
**Note**: Creates new rate and marks previous rate as effective_to=now()

```http
POST /api/admin/brokers/1/rates
Content-Type: application/json

{
  "service": "MEDICAL_TRANSPORT",
  "base_rate": 55.00,
  "per_mile_rate": 2.75,
  "notes": "Q3 2026 rate increase"
}
```

**Response (201)**:
```json
{
  "rate": {
    "id": 8,
    "broker_id": 1,
    "service": "MEDICAL_TRANSPORT",
    "base_rate": 55.00,
    "per_mile_rate": 2.75,
    "effective_from": "2026-08-02T14:35:00Z",
    "effective_to": null,
    "created_at": "2026-08-02T14:35:00Z"
  }
}
```

---

## Broker Requests

### Submit Broker Request (Form)
```http
POST /api/broker-requests
Content-Type: application/json

{
  "broker_id": 1,
  "broker_name": "ABC Transport Inc.",
  "service": "MEDICAL_TRANSPORT",
  "pickup": "123 Main St, Boston MA 02101",
  "destination": "456 Oak Ave, Quincy MA 02169",
  "pickup_lat": 42.3601,
  "pickup_lng": -71.0589,
  "destination_lat": 42.2555,
  "destination_lng": -71.0096,
  "trip_date": "2026-08-15",
  "trip_time": "14:30",
  "booking_reference": "BK-20260815-001",
  "broker_quoted_rate": 85.00,
  "platform_calculated_rate": 80.00,
  "submission_method": "FORM",
  "submitted_by": "dispatcher_name"
}
```

**Response (201)** - Auto-confirmed:
```json
{
  "request": {
    "id": 42,
    "broker_id": 1,
    "broker_name": "ABC Transport Inc.",
    "service": "MEDICAL_TRANSPORT",
    "pickup": "123 Main St, Boston MA 02101",
    "destination": "456 Oak Ave, Quincy MA 02169",
    "trip_date": "2026-08-15",
    "trip_time": "14:30",
    "broker_quoted_rate": 85.00,
    "platform_calculated_rate": 80.00,
    "rate_delta": 5.00,
    "submission_method": "FORM",
    "submitted_by": "dispatcher_name",
    "request_status": "AUTO_CONFIRMED",
    "dispatch_reviewed": false,
    "created_at": "2026-08-02T14:40:00Z"
  },
  "autoConfirmed": true
}
```

**Note**: Dispatch notified immediately via SMS/email with rate delta summary.

---

### Get Pending Broker Requests
```http
GET /api/admin/broker-requests?status=AUTO_CONFIRMED
```

**Response (200)**:
```json
{
  "requests": [
    {
      "id": 42,
      "broker_id": 1,
      "broker_name": "ABC Transport Inc.",
      "service": "MEDICAL_TRANSPORT",
      "pickup": "123 Main St, Boston MA 02101",
      "destination": "456 Oak Ave, Quincy MA 02169",
      "trip_date": "2026-08-15",
      "trip_time": "14:30",
      "broker_quoted_rate": 85.00,
      "platform_calculated_rate": 80.00,
      "rate_delta": 5.00,
      "request_status": "AUTO_CONFIRMED",
      "dispatch_reviewed": false,
      "created_at": "2026-08-02T14:40:00Z"
    },
    { ... }
  ]
}
```

**Query Parameters**:
- `status=AUTO_CONFIRMED` (default) - Only auto-confirmed requests
- `status=APPROVED` - Approved requests
- `status=REJECTED` - Rejected requests

---

### Dispatch Review: Approve/Reject Request
```http
PATCH /api/admin/broker-requests/42
Content-Type: application/json

{
  "dispatch_status": "APPROVED",
  "dispatch_notes": "Rate competitive with market. Proceeding with dispatch."
}
```

**Response (200)**:
```json
{
  "request": {
    "id": 42,
    "broker_id": 1,
    "broker_name": "ABC Transport Inc.",
    "trip_date": "2026-08-15",
    "trip_time": "14:30",
    "broker_quoted_rate": 85.00,
    "rate_delta": 5.00,
    "request_status": "APPROVED",
    "dispatch_reviewed": true,
    "dispatch_reviewed_at": "2026-08-02T15:00:00Z",
    "dispatch_reviewed_by": "dispatcher_name",
    "dispatch_notes": "Rate competitive with market. Proceeding with dispatch."
  }
}
```

**Valid dispatch_status values**:
- `APPROVED` - Accept broker rate, proceed with dispatch
- `REJECTED` - Decline broker rate, use platform calculated rate
- `PENDING_INFO` - Awaiting additional details from broker

---

## Analytics & Reporting

### Get Broker Dashboard (Current Period)
```http
GET /api/admin/brokers/1/dashboard
```

**Response (200)**:
```json
{
  "broker": {
    "id": 1,
    "name": "ABC Transport Inc.",
    "contact_email": "broker@abc-transport.com",
    "status": "ACTIVE"
  },
  "currentPeriod": {
    "start": "2026-08-01",
    "end": "2026-08-31",
    "rides": 47,
    "revenue": 4215.50
  },
  "recentInvoices": [
    {
      "id": 3,
      "broker_id": 1,
      "period_start": "2026-07-01",
      "period_end": "2026-07-31",
      "total_rides": 52,
      "total_revenue": 4502.00,
      "invoice_amount": 4502.00,
      "status": "PAID",
      "due_date": "2026-08-30",
      "paid_at": "2026-08-28T10:15:00Z"
    },
    { ... }
  ]
}
```

---

### Export Broker Data (CSV)
```http
GET /api/admin/brokers/1/export
```

**Response (200)** - `text/csv`:
```csv
booking_reference,service,pickup,destination,date,time,broker_rate,platform_rate,delta,status
BK-20260815-001,MEDICAL_TRANSPORT,"123 Main St, Boston MA","456 Oak Ave, Quincy MA",2026-08-15,14:30,85.00,80.00,5.00,APPROVED
BK-20260815-002,MEDICAL_TRANSPORT,"789 Park St, Boston MA","321 River Rd, Cambridge MA",2026-08-15,15:45,95.00,90.00,5.00,APPROVED
```

---

## Email Webhook

### Submit via Email (Automated)
Brokers send structured email to `contact@nexusmt.com`:

```email
From: broker@abc-transport.com
Subject: Rate Quote - Boston Route

Pickup: 123 Main St, Boston MA 02101
Destination: 456 Oak Ave, Quincy MA 02169
Date: 08/15/2026
Time: 2:30 PM
Service: MEDICAL_TRANSPORT
Rate: $85.00

Thanks,
John Broker
```

**Webhook receives** (internal):
```http
POST /.netlify/functions/broker-email-webhook
Content-Type: application/json

{
  "from": "broker@abc-transport.com",
  "sender_name": "John Broker",
  "text": "Pickup: 123 Main St...",
  "subject": "Rate Quote - Boston Route"
}
```

**Response (201)** - Auto-created as broker request:
```json
{
  "success": true,
  "request_id": 43,
  "broker_id": 1,
  "broker_name": "ABC Transport Inc.",
  "parsed_route": "123 Main St, Boston MA → 456 Oak Ave, Quincy MA",
  "parsed_date": "2026-08-15",
  "parsed_time": "14:30",
  "parsed_rate": "$85.00",
  "auto_confirmed": true
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required field: broker_quoted_rate"
}
```

### 401 Unauthorized
```json
{
  "error": "Missing or invalid authorization token"
}
```

### 403 Forbidden
```json
{
  "error": "Insufficient permissions (requires ADMIN or DISPATCHER role)"
}
```

### 404 Not Found
```json
{
  "error": "Broker not found"
}
```

### 409 Conflict
```json
{
  "error": "Broker name already exists"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "requestId": "uuid-string"
}
```

---

## Rate Calculation Logic

When a broker submits a rate:

1. **Calculate Delta**: `delta = broker_rate - platform_rate`
2. **Notify Dispatch**: SMS alert: "Broker quote ${delta > 0 ? '+' : ''}${delta} vs platform rate"
3. **Auto-Confirm**: Status set to `AUTO_CONFIRMED`, awaiting dispatch review
4. **Dispatch Review**: Dispatcher approves/rejects via PATCH
5. **Settlement**: Approved requests aggregated into monthly broker_invoices

---

## Role-Based Access

| Endpoint | ADMIN | DISPATCHER | EXECUTIVE | BILLING | CUSTOMER |
|----------|-------|-----------|-----------|---------|----------|
| POST /admin/brokers | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /admin/brokers | ✅ | ✅ | ✅ | ✅ | ❌ |
| PATCH /admin/brokers/{id} | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /admin/brokers/{id}/rates | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /admin/broker-requests | ✅ | ✅ | ❌ | ❌ | ❌ |
| PATCH /admin/broker-requests/{id} | ✅ | ✅ | ❌ | ❌ | ❌ |
| GET /admin/brokers/{id}/dashboard | ✅ | ❌ | ✅ | ✅ | ❌ |
| POST /broker-requests | Public (no auth) | - | - | - | - |

---

## Examples

### 1. Create Broker and Add Rate
```bash
# Create
curl -X POST https://api.nexusmt.com/.netlify/functions/api?path=admin/brokers \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ABC Transport",
    "contact_email": "broker@abc.com",
    "net_terms_days": 30
  }'

# Add rate to broker ID 1
curl -X POST https://api.nexusmt.com/.netlify/functions/api?path=admin/brokers/1/rates \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "MEDICAL_TRANSPORT",
    "base_rate": 50,
    "per_mile_rate": 2.50
  }'
```

### 2. Submit Request and Review
```bash
# Dispatcher submits broker quote
curl -X POST https://api.nexusmt.com/.netlify/functions/api?path=broker-requests \
  -H "Content-Type: application/json" \
  -d '{
    "broker_id": 1,
    "broker_name": "ABC Transport",
    "service": "MEDICAL_TRANSPORT",
    "pickup": "123 Main St, Boston MA",
    "destination": "456 Oak Ave, Quincy MA",
    "trip_date": "2026-08-15",
    "trip_time": "14:30",
    "broker_quoted_rate": 85,
    "platform_calculated_rate": 80
  }'

# Dispatch reviews and approves
curl -X PATCH https://api.nexusmt.com/.netlify/functions/api?path=admin/broker-requests/42 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dispatch_status": "APPROVED",
    "dispatch_notes": "Proceed with dispatch"
  }'
```

### 3. Get Current Month Analytics
```bash
curl -X GET https://api.nexusmt.com/.netlify/functions/api?path=admin/brokers/1/dashboard \
  -H "Authorization: Bearer TOKEN"
```
