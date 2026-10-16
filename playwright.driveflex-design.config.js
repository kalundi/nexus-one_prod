const config=require('./playwright.driveflex.config');
module.exports={...config,timeout:30000,testMatch:['driveflex-dispatch.spec.js','driveflex-design.spec.js'],use:{...config.use,baseURL:'http://127.0.0.1:4188'},webServer:{...config.webServer,reuseExistingServer:true,url:'http://127.0.0.1:4188/career-application.html',env:{PORT:'4188'}}};
