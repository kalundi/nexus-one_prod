const config=require('./playwright.driveflex.config');
module.exports={...config,timeout:30000,testMatch:['dispatch-save.spec.js'],use:{...config.use,baseURL:'http://127.0.0.1:4189'},webServer:{...config.webServer,url:'http://127.0.0.1:4189/dispatch.html',env:{PORT:'4189'}}};
