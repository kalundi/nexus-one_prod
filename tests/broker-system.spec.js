const {test,expect}=require('@playwright/test');const{ADMIN_EMAIL,ADMIN_PASS}=process.env;

test.describe('Broker Management System',()=>{
 let page;
 const API_URL=process.env.API_URL||'/.netlify/functions/api';
 const TEST_BROKER={name:`Test Broker ${Date.now()}`,contact_email:`broker${Date.now()}@test.com`,contact_person:'John Broker',contact_phone:'555-1234',net_terms_days:30,notes:'Test broker for automated testing'};
 const TEST_RATE={service:'MEDICAL_TRANSPORT',base_rate:50,per_mile_rate:2.5,notes:'Test rate'};
 const TEST_REQUEST={pickup:'123 Main St, Boston MA',destination:'456 Oak Ave, Quincy MA',trip_date:new Date().toISOString().split('T')[0],trip_time:'14:30',service:'MEDICAL_TRANSPORT',broker_quoted_rate:85,platform_calculated_rate:80,broker_name:'Test Broker'};

 test.beforeEach(async({browser})=>{
  page=await browser.newPage();
  await page.context().addCookies([{name:'admin_token',value:process.env.TEST_TOKEN||'mock-token',url:'http://localhost:8888'}]);
 });

 test.afterEach(async()=>{
  await page.close();
 });

 test('POST /api/admin/brokers - Create new broker',async()=>{
  const response=await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.broker).toBeTruthy();
  expect(body.broker.name).toBe(TEST_BROKER.name);
  expect(body.broker.contact_email).toBe(TEST_BROKER.contact_email);
  expect(body.broker.net_terms_days).toBe(30);
 });

 test('GET /api/admin/brokers - List all active brokers',async()=>{
  await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  const response=await page.request.get(`${API_URL}?path=admin/brokers`);
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(Array.isArray(body.brokers)).toBeTruthy();
  expect(body.brokers.length).toBeGreaterThan(0);
 });

 test('GET /api/admin/brokers/{id} - Get broker details with rates',async()=>{
  const createRes=await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  const broker=await createRes.json();
  const brokerId=broker.broker.id;
  const response=await page.request.get(`${API_URL}?path=admin/brokers/${brokerId}`);
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(body.broker.id).toBe(brokerId);
  expect(Array.isArray(body.rates)).toBeTruthy();
 });

 test('PATCH /api/admin/brokers/{id} - Update broker details',async()=>{
  const createRes=await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  const broker=await createRes.json();
  const brokerId=broker.broker.id;
  const updateData={contact_person:'Updated Person',contact_phone:'555-9999'};
  const response=await page.request.patch(`${API_URL}?path=admin/brokers/${brokerId}`,{data:updateData});
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(body.broker.contact_person).toBe('Updated Person');
  expect(body.broker.contact_phone).toBe('555-9999');
 });

 test('POST /api/admin/brokers/{id}/rates - Add broker rate',async()=>{
  const createRes=await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  const broker=await createRes.json();
  const brokerId=broker.broker.id;
  const response=await page.request.post(`${API_URL}?path=admin/brokers/${brokerId}/rates`,{data:TEST_RATE});
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.rate.broker_id).toBe(brokerId);
  expect(body.rate.service).toBe('MEDICAL_TRANSPORT');
  expect(body.rate.base_rate).toBe(50);
  expect(body.rate.per_mile_rate).toBe(2.5);
 });

 test('POST /api/broker-requests - Submit broker rate request (form)',async()=>{
  const response=await page.request.post(`${API_URL}?path=broker-requests`,{data:TEST_REQUEST});
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.request).toBeTruthy();
  expect(body.request.pickup).toBe(TEST_REQUEST.pickup);
  expect(body.request.destination).toBe(TEST_REQUEST.destination);
  expect(body.request.broker_quoted_rate).toBe(85);
  expect(body.request.submission_method).toBe('FORM');
  expect(body.request.request_status).toBe('AUTO_CONFIRMED');
  expect(body.autoConfirmed).toBe(true);
  expect(body.clientMessage).toContain('received');
 });

 test('GET /api/admin/broker-requests - List pending requests',async()=>{
  await page.request.post(`${API_URL}?path=broker-requests`,{data:TEST_REQUEST});
  const response=await page.request.get(`${API_URL}?path=admin/broker-requests?status=AUTO_CONFIRMED`);
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(Array.isArray(body.requests)).toBeTruthy();
 });

 test('PATCH /api/admin/broker-requests/{id} - Dispatch review and approval',async()=>{
  const submitRes=await page.request.post(`${API_URL}?path=broker-requests`,{data:TEST_REQUEST});
  const request=await submitRes.json();
  const requestId=request.request.id;
  const reviewData={dispatch_status:'APPROVED',dispatch_notes:'Rate looks good, proceeding with booking'};
  const response=await page.request.patch(`${API_URL}?path=admin/broker-requests/${requestId}`,{data:reviewData});
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(body.request.dispatch_reviewed).toBe(true);
  expect(body.request.request_status).toBe('APPROVED');
 });

 test('GET /api/admin/brokers/{id}/dashboard - Broker analytics',async()=>{
  const createRes=await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  const broker=await createRes.json();
  const brokerId=broker.broker.id;
  const response=await page.request.get(`${API_URL}?path=admin/brokers/${brokerId}/dashboard`);
  expect(response.status()).toBe(200);
  const body=await response.json();
  expect(body.broker).toBeTruthy();
  expect(body.currentPeriod).toBeTruthy();
  expect(typeof body.currentPeriod.rides).toBe('number');
  expect(typeof body.currentPeriod.revenue).toBe('number');
 });

 test('GET /api/admin/brokers/{id}/export - Export broker data as CSV',async()=>{
  const createRes=await page.request.post(`${API_URL}?path=admin/brokers`,{data:TEST_BROKER});
  const broker=await createRes.json();
  const brokerId=broker.broker.id;
  await page.request.post(`${API_URL}?path=broker-requests`,{data:TEST_REQUEST});
  const response=await page.request.get(`${API_URL}?path=admin/brokers/${brokerId}/export`);
  expect(response.status()).toBe(200);
  const text=await response.text();
  expect(text).toContain('booking_reference');
  expect(text).toContain('service');
 });

 test('Email webhook - Parse and create broker request from email',async()=>{
  const emailPayload={
   from:TEST_BROKER.contact_email,
   sender_name:TEST_BROKER.name,
   text:`
   Pickup: 789 Park St, Boston MA
   Destination: 321 River Rd, Cambridge MA
   Date: ${TEST_REQUEST.trip_date}
   Time: 15:45
   Service: MEDICAL_TRANSPORT
   Rate Quote: $95.00
   `,
   body:`Pickup: 789 Park St, Boston MA\\nDestination: 321 River Rd, Cambridge MA\\nDate: ${TEST_REQUEST.trip_date}\\nTime: 15:45\\nService: MEDICAL_TRANSPORT\\nRate Quote: $95.00`
  };
  const response=await page.request.post('/.netlify/functions/broker-email-webhook',{data:emailPayload});
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.success).toBe(true);
  expect(body.parsed_route).toContain('Park St');
  expect(body.parsed_rate).toContain('95');
  expect(body.auto_confirmed).toBe(true);
 });

 test('Broker request rate delta calculation',async()=>{
  const requestWithDelta={...TEST_REQUEST,platform_calculated_rate:80,broker_quoted_rate:95};
  const response=await page.request.post(`${API_URL}?path=broker-requests`,{data:requestWithDelta});
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect(body.request.rate_delta).toBe(15);
 });
});
