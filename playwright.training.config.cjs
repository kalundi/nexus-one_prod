const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests',testMatch:'training-workflow.spec.js',timeout:60000,workers:1,use:{headless:true}});
