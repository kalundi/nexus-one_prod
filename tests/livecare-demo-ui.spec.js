const {test,expect}=require('@playwright/test');
const Demo=require('../netlify/functions/_shared/livecare-demo.cjs');
test('fast LiveCare shows a named driver, road routes, delay alerts and completion without duplicate notifications',async({page})=>{
 let elapsed=0;const started=Date.now();
 await page.addInitScript(()=>{
  const point=(lat,lng)=>({lat:()=>lat,lng:()=>lng});
  window.demoTest={positions:[],requests:[]};
  window.google={maps:{
   Map:class{constructor(element){this.element=element;}fitBounds(){}},
   LatLngBounds:class{union(){}extend(){}},
   DirectionsRenderer:class{constructor(options){this.options=options;}setMap(){}setDirections(){}},
   InfoWindow:class{constructor(options){this.options=options;}open({map}){map.element.append(this.options.content);}close(){this.options.content.remove();}},
   DirectionsService:class{async route(request){window.demoTest.requests.push(request);const a=request.origin,b=request.destination;return {routes:[{overview_path:[point(a.lat,a.lng),point(a.lat,b.lng),point(b.lat,b.lng)],legs:[{start_address:'123 Demo Pickup Road, Gaithersburg, MD',end_address:'456 Demo Destination Avenue, Bethesda, MD',start_location:point(a.lat,a.lng),end_location:point(b.lat,b.lng),distance:{value:1000}}]}]};}},
   Marker:class{setMap(){}setPosition(position){window.demoTest.positions.push({lat:typeof position.lat==='function'?position.lat():position.lat,lng:typeof position.lng==='function'?position.lng():position.lng});}},
   event:{trigger(){}}
  }};
 });
 await page.route('**/api/**',async route=>{
  if(new URL(route.request().url()).pathname===`/api/bookings/${Demo.REFERENCE}`){
   const booking=Demo.project({reference:Demo.REFERENCE,bookingSource:'MOCK',notes:Demo.NOTE,createdAt:new Date(started).toISOString(),pickup:'Demo pickup',destination:'Demo destination',pickupLat:39.155,pickupLng:-77.24,destinationLat:39.04,destinationLng:-77.117,date:'2026-10-25',time:'09:00'},started+elapsed*1000);
   return route.fulfill({json:{booking}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto(`/patient.html?reference=${Demo.REFERENCE}`,{waitUntil:'domcontentloaded'});
 await page.getByLabel('Booking phone number',{exact:true}).fill(Demo.PHONE);
 await page.getByRole('button',{name:'View shared ride',exact:true}).click();
 await expect(page.locator('#demoDriver')).toContainText('James Carter');
 await expect(page.locator('#mapRouteSummary')).toContainText('Orange: driver');
 await expect(page.locator('#demoCommunicationLog')).toContainText('Driver activated trip');
 await expect(page.locator('#demoCommunicationLog')).toContainText('Destination contact');
 await expect.poll(()=>page.evaluate(()=>window.demoTest.requests.length)).toBe(2);
 await expect(page.locator('#mapPickup')).toHaveText('123 Demo Pickup Road, Gaithersburg, MD');
 await expect(page.locator('#mapDestination')).toHaveText('456 Demo Destination Avenue, Bethesda, MD');
 await expect(page.locator('.demoMapEndpoint')).toHaveCount(2);
 elapsed=56;
 await expect(page.locator('#demoCommunicationLog')).toContainText('Delay detected',{timeout:10000});
 await expect(page.locator('#patientMapStatus')).toContainText('driver paused');
 await expect(page.locator('.demoDelay')).toHaveCount(1);
 // Another poll must update the marker without duplicating notification cards.
 elapsed=75;
 await expect(page.locator('#demoCommunicationLog')).toContainText('Vehicle moving again',{timeout:10000});
 await expect(page.locator('.demoDelay')).toHaveCount(1);
 const routePoint=await page.evaluate(()=>window.demoTest.positions.at(-1));
 expect(routePoint.lat===39.155||routePoint.lng===-77.117).toBe(true);
 elapsed=135;
 await expect(page.locator('#demoCommunicationLog')).toContainText('Trip completed',{timeout:10000});
 await expect(page.locator('#patientMapStatus')).toContainText('tracking has ended');
});
