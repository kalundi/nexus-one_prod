# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking-payment.spec.js >> shows the payment section after a successful booking submission
- Location: tests\booking-payment.spec.js:3:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('#confirmRiderBtn')
    - locator resolved to <button type="button" class="primary" id="confirmRiderBtn">Confirm Details</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <section aria-expanded="false" id="riderDetailsSection" class="section sectionProgressive nexusFocusItem unlocked">…</section> intercepts pointer events
  155 × retrying click action
        - waiting 500ms
        - waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <section aria-expanded="false" id="riderDetailsSection" class="section sectionProgressive nexusFocusItem unlocked">…</section> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - heading "Book Nexus Medical Transit home Ride" [level=1] [ref=e4]:
      - generic [ref=e5]: Book
      - link "Nexus Medical Transit home" [ref=e6] [cursor=pointer]:
        - /url: /
        - img "Nexus Medical Transit" [ref=e7]
      - generic [ref=e8]: Ride
    - progressbar "Booking progress" [ref=e9]:
      - generic [ref=e10]:
        - text: "Current:"
        - strong [ref=e11]: Rider
        - text: ". Next:"
        - strong [ref=e12]: Route
        - text: .
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: 👤
          - generic [ref=e16]: Rider
        - generic [ref=e18]:
          - generic [ref=e19]: ⌖
          - generic [ref=e20]: Route
        - generic [ref=e22]:
          - generic [ref=e23]: ♿
          - generic [ref=e24]: Ride
        - generic [ref=e26]:
          - generic [ref=e27]: ✓
          - generic [ref=e28]: Review
        - generic [ref=e30]:
          - generic [ref=e31]: 💳
          - generic [ref=e32]: Payment
    - complementary "Accessibility preferences" [ref=e33]:
      - strong [ref=e34]: Make this page easier to use
      - generic [ref=e35]:
        - button "Larger text" [ref=e36] [cursor=pointer]
        - button "High contrast" [ref=e37] [cursor=pointer]
        - button "Reduce motion" [ref=e38] [cursor=pointer]
        - button "Read next step" [ref=e39] [cursor=pointer]
    - generic [ref=e40]:
      - complementary [ref=e41]:
        - generic [ref=e42]: ↓
        - generic [ref=e43]:
          - generic [ref=e44]: Next step
          - strong [ref=e45]: Enter and confirm the rider’s details.
        - button "Go" [ref=e46] [cursor=pointer]
      - generic [ref=e47] [cursor=pointer]:
        - heading "Login" [level=2] [ref=e48]
        - generic [ref=e49]:
          - paragraph [ref=e50]: Book as guest anytime. Sign up to save 5% on every ride.
          - generic [ref=e51]: CUSTOMER
        - generic [ref=e52]:
          - generic [ref=e53]:
            - generic [ref=e54]: User email
            - textbox "User email" [ref=e55]:
              - /placeholder: name@example.com
          - generic [ref=e56]:
            - generic [ref=e57]: Password
            - textbox "Password" [ref=e58]
            - button "Show password" [ref=e59]: Show
        - button "Forgot password?" [ref=e61]
        - button "Sign Up & Save 5%" [ref=e63]
        - text: ○ ○ ○ ○ ○ ✓ ✓ ✓ Use the Sign In button next to Book My Ride after entering your email and password. Book as a guest anytime, or create your rider account to lock in 5% off every ride.
        - button "Manage an existing trip" [ref=e65]
      - generic [ref=e66] [cursor=pointer]:
        - heading "Rider Details" [level=2]
        - paragraph: Enter the passenger details below.
        - generic:
          - generic: Passenger name
          - textbox "Passenger name":
            - /placeholder: Full name
            - text: Ava Patel
        - generic:
          - generic: Phone
          - textbox "Phone":
            - /placeholder: (240) 555-0101
            - text: (240) 555-0101
          - generic: If you pause for five minutes before finishing, we’ll send one text reminder with a secure link back to booking. Reply STOP to opt out.
        - generic:
          - generic: Email (optional)
          - textbox "Email (optional)" [active]:
            - /placeholder: name@example.com
            - text: ava@example.com
        - generic:
          - generic: How will this ride be paid?
          - combobox "How will this ride be paid?":
            - option "Self-pay / private pay" [selected]
            - option "Private insurance (plan verification)"
            - option "Medicare"
            - option "Maryland Medicaid"
        - generic:
          - generic: Notes (optional)
          - textbox "Notes (optional)":
            - /placeholder: Gate code, mobility info, or pickup instructions
        - generic:
          - button "Confirm Details"
      - generic [ref=e67] [cursor=pointer]:
        - generic:
          - heading "Type of Ride" [level=2]
          - button "Help Me Choose"
        - paragraph: Choose the option that best supports the rider’s mobility and care needs. All available customer services remain visible here.
        - radiogroup "Service type":
          - 'button "Ambulatory For riders who can walk independently or with light assistance. Best for: walking riders Selected" [pressed]':
            - generic: 🚶
            - generic:
              - generic: Ambulatory
              - generic: For riders who can walk independently or with light assistance.
              - generic: "Best for: walking riders"
            - generic: Selected
          - 'button "Wheelchair Accessible vehicle and securement for riders remaining in a wheelchair. Best for: wheelchair users Selected"':
            - generic: ♿
            - generic:
              - generic: Wheelchair
              - generic: Accessible vehicle and securement for riders remaining in a wheelchair.
              - generic: "Best for: wheelchair users"
            - generic: Selected
          - 'button "Stretcher For riders who must travel lying down; needs may require review. Best for: non-ambulatory transport Selected"':
            - generic: ▰
            - generic:
              - generic: Stretcher
              - generic: For riders who must travel lying down; needs may require review.
              - generic: "Best for: non-ambulatory transport"
            - generic: Selected
          - 'button "Additional Capacity Additional space, capacity, or specialized mobility support. Best for: riders needing more space Selected"':
            - generic: ↔
            - generic:
              - generic: Additional Capacity
              - generic: Additional space, capacity, or specialized mobility support.
              - generic: "Best for: riders needing more space"
            - generic: Selected
        - generic:
          - generic:
            - generic: Date
            - textbox "Date"
          - generic:
            - generic: Appointment Time
            - textbox "Appointment Time"
        - generic:
          - generic:
            - generic: Pickup Time Estimate
            - textbox "Pickup Time Estimate":
              - /placeholder: Auto-calculated from appointment and route
        - paragraph: We calculate a recommended pickup time so the rider can arrive before the appointment.
        - generic:
          - generic:
            - generic: Distance
            - generic: "-"
          - generic:
            - generic: ETA
            - generic: "-"
          - generic:
            - generic: Subtotal
            - generic: "-"
          - generic:
            - generic: Card Processing Fee (3%)
            - generic: "-"
          - generic:
            - generic: Fare Estimate
            - generic: "-"
        - paragraph: Fare estimate is calculated automatically. A 3% card processing fee is included.
        - paragraph: Unlock instant 5% savings on every ride. Sign up now.
      - generic [ref=e70]:
        - button "Sign in" [ref=e71] [cursor=pointer]: Sign In
        - button "Book My Ride" [disabled] [ref=e72]
  - button "Open Section 508 accessibility options" [ref=e74] [cursor=pointer]: ♿508
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | test('shows the payment section after a successful booking submission', async ({ page }) => {
  4   | 
  5   |   await page.route('**/api/settings/public', async (route) => {
  6   |     await route.fulfill({
  7   |       status: 200,
  8   |       contentType: 'application/json',
  9   |       body: JSON.stringify({
  10  |         pricing: {
  11  |           ambulatory: {
  12  |             label: 'Ambulatory Transportation',
  13  |             base: 65,
  14  |             includedMiles: 5,
  15  |             perMile: 3.25,
  16  |             waitPer15: 20
  17  |           }
  18  |         },
  19  |         fareRules: { taxRatePct: 0 }
  20  |       })
  21  |     });
  22  |   });
  23  | 
  24  |   await page.route('**/api/integrations/config', async (route) => {
  25  |     await route.fulfill({
  26  |       status: 200,
  27  |       contentType: 'application/json',
  28  |       body: JSON.stringify({
  29  |         stripeEnabled: true,
  30  |         squareEnabled: false,
  31  |         googleMapsEnabled: false,
  32  |         googleMapsBrowserKey: ''
  33  |       })
  34  |     });
  35  |   });
  36  | 
  37  |   await page.route('**/api/locations/search', async (route) => {
  38  |     await route.fulfill({
  39  |       status: 200,
  40  |       contentType: 'application/json',
  41  |       body: JSON.stringify({ locations: [{ lat: 39.0458, lng: -76.6413 }] })
  42  |     });
  43  |   });
  44  | 
  45  |   await page.route('**/api/fleet/live', async (route) => {
  46  |     await route.fulfill({
  47  |       status: 200,
  48  |       contentType: 'application/json',
  49  |       body: JSON.stringify({ vehicles: [] })
  50  |     });
  51  |   });
  52  | 
  53  |   await page.route('**/api/bookings', async (route) => {
  54  |     await route.fulfill({
  55  |       status: 200,
  56  |       contentType: 'application/json',
  57  |       body: JSON.stringify({
  58  |         booking: {
  59  |           reference: 'BK-1001',
  60  |           estimatedFare: 95.0
  61  |         },
  62  |         clientMessage: 'Booking created successfully.',
  63  |         persisted: true
  64  |       })
  65  |     });
  66  |   });
  67  | 
  68  |   await page.route('**/api/payments/stripe/checkout', async (route) => {
  69  |     await route.fulfill({
  70  |       status: 200,
  71  |       contentType: 'application/json',
  72  |       body: JSON.stringify({ url: 'http://127.0.0.1:4173/checkout' })
  73  |     });
  74  |   });
  75  | 
  76  |   page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  77  |   page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
  78  | 
  79  |   await page.goto('/booking-app.html', { waitUntil: 'load' });
  80  | 
  81  |   await page.locator('#name').fill('Ava Patel');
  82  |   await page.locator('#phone').fill('(240) 555-0101');
  83  |   await page.locator('#email').fill('ava@example.com');
> 84  |   await page.locator('#confirmRiderBtn').click();
      |                                          ^ Error: locator.click: Test timeout of 90000ms exceeded.
  85  | 
  86  |   await page.locator('#pickup').fill('155 Limpkin Avenue, Clarksburg, Maryland');
  87  |   await page.locator('#destination').fill('2000 Medical Parkway, Annapolis, Maryland');
  88  |   await page.locator('#confirmPickupDropoffBtn').click();
  89  | 
  90  |   await page.evaluate(() => {
  91  |     const rideTypeSection = document.querySelector('#rideTypeSection');
  92  |     if(rideTypeSection){
  93  |       rideTypeSection.classList.add('unlocked');
  94  |       rideTypeSection.classList.remove('sectionCollapsed');
  95  |       rideTypeSection.style.display = 'block';
  96  |     }
  97  |   });
  98  | 
  99  |   await page.locator('#tripDate').fill('2030-08-15');
  100 |   await page.locator('#tripTime').fill('10:30');
  101 | 
  102 |   await page.evaluate(() => {
  103 |     window.NexusBookingApp?.showPaymentOptions('BK-1001', 95);
  104 |   });
  105 | 
  106 |   await expect(page.locator('#paymentSection')).toBeVisible();
  107 |   await expect(page.locator('#paymentSummary')).toContainText('BK-1001');
  108 |   await expect(page.locator('#payDepositBtn')).toBeEnabled();
  109 |   await expect(page.locator('#depositAmountLabel')).toContainText('$');
  110 |   await expect(page.locator('#payFullBtn')).toBeEnabled();
  111 | 
  112 |   await page.evaluate(() => {
  113 |     window.NexusBookingApp?.startHostedPayment('stripe', 'full');
  114 |   });
  115 |   await expect(page.locator('#paymentStatusMsg')).toContainText('Preparing full payment checkout', { timeout: 10000 });
  116 | });
  117 | 
  118 | test('falls back to Square when Stripe is unavailable', async ({ page }) => {
  119 |   await page.route('**/api/settings/public', async (route) => {
  120 |     await route.fulfill({
  121 |       status: 200,
  122 |       contentType: 'application/json',
  123 |       body: JSON.stringify({
  124 |         pricing: {
  125 |           ambulatory: {
  126 |             label: 'Ambulatory Transportation',
  127 |             base: 65,
  128 |             includedMiles: 5,
  129 |             perMile: 3.25,
  130 |             waitPer15: 20
  131 |           }
  132 |         },
  133 |         fareRules: { taxRatePct: 0 }
  134 |       })
  135 |     });
  136 |   });
  137 | 
  138 |   await page.route('**/api/integrations/config', async (route) => {
  139 |     await route.fulfill({
  140 |       status: 200,
  141 |       contentType: 'application/json',
  142 |       body: JSON.stringify({
  143 |         stripeEnabled: false,
  144 |         squareEnabled: true,
  145 |         googleMapsEnabled: false,
  146 |         googleMapsBrowserKey: ''
  147 |       })
  148 |     });
  149 |   });
  150 | 
  151 |   await page.route('**/api/locations/search', async (route) => {
  152 |     await route.fulfill({
  153 |       status: 200,
  154 |       contentType: 'application/json',
  155 |       body: JSON.stringify({ locations: [{ lat: 39.0458, lng: -76.6413 }] })
  156 |     });
  157 |   });
  158 | 
  159 |   await page.route('**/api/fleet/live', async (route) => {
  160 |     await route.fulfill({
  161 |       status: 200,
  162 |       contentType: 'application/json',
  163 |       body: JSON.stringify({ vehicles: [] })
  164 |     });
  165 |   });
  166 | 
  167 |   await page.route('**/api/bookings', async (route) => {
  168 |     await route.fulfill({
  169 |       status: 200,
  170 |       contentType: 'application/json',
  171 |       body: JSON.stringify({
  172 |         booking: {
  173 |           reference: 'BK-1002',
  174 |           estimatedFare: 80.0
  175 |         },
  176 |         clientMessage: 'Booking created successfully.',
  177 |         persisted: true
  178 |       })
  179 |     });
  180 |   });
  181 | 
  182 |   await page.route('**/api/payments/square/checkout', async (route) => {
  183 |     await route.fulfill({
  184 |       status: 200,
```