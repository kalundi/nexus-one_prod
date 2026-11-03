const {test,expect}=require('@playwright/test');
function mockAssistant(page,{delay=0}={}){
 const requests=[];
 return page.route('**/.netlify/functions/visitor-assistant',async route=>{
  const data=route.request().postDataJSON();
  requests.push(data);
  if(delay)await new Promise(r=>setTimeout(r,delay));
  let answer;
  if(/^hi$/i.test(data.question.trim()))answer="Hi! I'm Nex. How can I help?";
  else if(/wheelchair/i.test(data.question))answer='Yes. Nexus offers wheelchair transportation.';
  else if(/stretcher/i.test(data.question))answer='We also offer stretcher transportation.';
  else answer='Nex can help with transportation services.';
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({answer,sources:['wheelchair-transportation.html'],mode:'composed'})});
 });
}
test('greeting, service question, and history remain visible in order',async({page})=>{
 const requests=[];
 await page.route('**/.netlify/functions/visitor-assistant',route=>{
  const data=route.request().postDataJSON();requests.push(data);
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    answer:data.question==='Hi'?'Hi! I am Nex. How can I help?':'Yes. Nexus offers wheelchair transportation.',
    sources:['wheelchair-transportation.html']})});
 });
 await page.goto('/ask-nex.html');
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Hi');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message.user')).toHaveCount(1);
 await expect(page.locator('.message.assistant')).toHaveCount(1);
 await expect(page.locator('.message.assistant')).toContainText('Hi! I am Nex');
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Do you offer wheelchair transportation?');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message.user')).toHaveCount(2);
 await expect(page.locator('.message.assistant')).toHaveCount(2);
 expect(requests[1].history).toEqual([{role:'user',text:'Hi'},{role:'assistant',text:'Hi! I am Nex. How can I help?'}]);
 await expect(page.locator('.chat-sources a')).toHaveCount(2);
});
test('new conversation clears visible messages and follow-up context',async({page})=>{
 const requests=[];
 await page.route('**/.netlify/functions/visitor-assistant',route=>{
  const data=route.request().postDataJSON();requests.push(data);
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({answer:'I can help with that.',sources:[]})});
 });
 await page.goto('/ask-nex.html');
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Hi');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message')).toHaveCount(2);
 await page.getByRole('button',{name:'New conversation'}).click();
 await expect(page.locator('.message')).toHaveCount(0);
 await expect(page.getByText('New conversation. What can Nex help you with?')).toBeVisible();
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Hello');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message')).toHaveCount(2);
 expect(requests.at(-1).history).toEqual([]);
});
test('mobile chat fits viewport and can send a follow-up',async({page,isMobile})=>{
 await mockAssistant(page);
 await page.goto('/ask-nex.html');
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Hi');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message.assistant')).toContainText("I'm Nex");
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('What about stretcher?');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message.assistant')).toHaveCount(2);
 if(isMobile){
  const overflows=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  expect(overflows).toBe(false);
 }
});
test('untrusted answer is shown as text, not executable markup',async({page})=>{
 await page.route('**/.netlify/functions/visitor-assistant',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({answer:'<img src=x onerror=alert(1)>',sources:[]})
 }));
 await page.goto('/ask-nex.html');
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Hi');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await expect(page.locator('.message.assistant')).toContainText('<img src=x onerror=alert(1)>');
 await expect(page.locator('.message.assistant img')).toHaveCount(0);
});
test('in-flight reset does not restore old answer',async({page})=>{
 await mockAssistant(page,{delay:200});
 await page.goto('/ask-nex.html');
 await page.getByLabel('Ask a question about Nexus Medical Transit').fill('Hi');
 await page.getByRole('button',{name:'Ask Nex'}).click();
 await page.getByRole('button',{name:'New conversation'}).click();
 await expect(page.locator('.message')).toHaveCount(0);
 await page.waitForTimeout(280);
 await expect(page.locator('.message')).toHaveCount(0);
});
