const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',
  testMatch:'nex-conversation.spec.cjs',
  timeout:30000,
  expect:{timeout:7000},
  fullyParallel:true,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['github'],['html',{open:'never'}]]:'list',
  use:{baseURL:'http://127.0.0.1:4179',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium-desktop',use:{...devices['Desktop Chrome']}},
    {name:'mobile-webkit',use:{...devices['iPhone 13']}}
  ],
  webServer:{
    command:'node scripts/nex-playwright-server.cjs',
    url:'http://127.0.0.1:4179/ask-nex.html',
    reuseExistingServer:!process.env.CI,
    timeout:15000
  }
});
