const { test, expect } = require('@playwright/test');

const mobileViewports = [
  { name:'small Android', width:320, height:740 },
  { name:'standard Android', width:360, height:800 },
  { name:'iPhone', width:390, height:844 },
  { name:'large mobile', width:430, height:932 }
];

async function revealBookingStory(page, mode){
  await page.goto('/booking-app.html', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.NexusBookingApp));
  await page.evaluate((scheduleMode) => {
    document.body.classList.add('showCompletedSections');
    document.querySelectorAll('#bookingForm .section').forEach((section) => {
      section.classList.add('unlocked', 'currentBookingCard');
      section.classList.remove('sectionCollapsed', 'sectionHiddenInFinal', 'progressiveHidden');
    });
    const multi = document.querySelector('#multipleStopsToggle');
    multi.checked = true;
    multi.dispatchEvent(new Event('change', { bubbles:true }));
    const count = document.querySelector('#stopCountSelect');
    count.value = '3';
    count.dispatchEvent(new Event('change', { bubbles:true }));
    const tripType = document.querySelector('#tripType');
    tripType.value = scheduleMode;
    tripType.dispatchEvent(new Event('change', { bubbles:true }));
  }, mode);
  await page.waitForTimeout(150);
}

async function visibleTextControlCollisions(page){
  return page.locator('#bookingForm').evaluate((form) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const controls = [...form.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')]
      .filter(visible)
      .map((element) => ({ id:element.id || element.name || element.tagName, box:element.getBoundingClientRect() }));
    const collisions = [];
    for(let i=0;i<controls.length;i+=1){
      const a=controls[i];
      if(a.box.left < -0.5 || a.box.right > innerWidth + 0.5) collisions.push(`${a.id} escapes viewport (${a.box.left.toFixed(1)}..${a.box.right.toFixed(1)})`);
      for(let j=i+1;j<controls.length;j+=1){
        const b=controls[j];
        const horizontalOverlap=Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left);
        const verticalOverlap=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top);
        if(horizontalOverlap>0.5&&verticalOverlap>0.5) collisions.push(`${a.id} overlaps ${b.id}`);
        const sameRow=verticalOverlap>Math.min(a.box.height,b.box.height)*0.45;
        const sameColumn=horizontalOverlap>Math.min(a.box.width,b.box.width)*0.45;
        const horizontalGap=Math.max(b.box.left-a.box.right,a.box.left-b.box.right);
        const verticalGap=Math.max(b.box.top-a.box.bottom,a.box.top-b.box.bottom);
        if(sameRow&&horizontalGap>=0&&horizontalGap<6) collisions.push(`${a.id} touches ${b.id} horizontally (${horizontalGap.toFixed(1)}px)`);
        if(sameColumn&&verticalGap>=0&&verticalGap<6) collisions.push(`${a.id} touches ${b.id} vertically (${verticalGap.toFixed(1)}px)`);
      }
    }
    return [...new Set(collisions)];
  });
}

for(const viewport of mobileViewports){
  for(const mode of ['ROUND_TRIP','RECURRING']){
    test(`${viewport.name} ${mode.toLowerCase()} booking story keeps every text control separated`, async ({ page }) => {
      await page.setViewportSize({ width:viewport.width, height:viewport.height });
      await revealBookingStory(page, mode);
      const collisions = await visibleTextControlCollisions(page);
      expect(collisions, collisions.join('\n')).toEqual([]);
    });
  }
}
