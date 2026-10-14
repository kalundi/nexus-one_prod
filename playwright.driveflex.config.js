const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests',
 testMatch:['career-application-workflow.spec.js','driveflex-dispatch.spec.js','driveflex-shifts.spec.js'],
 timeout:90000,
 use:{baseURL:'http://127.0.0.1:4187',headless:true,viewport:{width:390,height:844},trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/local-test-server.cjs',url:'http://127.0.0.1:4187/career-application.html',env:{PORT:'4187'},reuseExistingServer:false,timeout:120000},
 workers:1
});
