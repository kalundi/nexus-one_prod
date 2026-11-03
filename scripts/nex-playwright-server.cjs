'use strict';
// Serves the public Ask Nex page and admin dashboard assets for local mocked Playwright checks.
// The real visitor-assistant HTTP endpoint is intercepted in the browser tests.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.NEX_E2E_PORT||4179);
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const paths={'/ask-nex.html':'ask-nex.html','/ask-nex':'ask-nex.html',
    '/nex-insights.html':'nex-insights.html','/nex-insights':'nex-insights.html',
    '/nex-insights.js':'nex-insights.js','/nex-knowledge-editor.js':'nex-knowledge-editor.js',
    '/auth-guard.js':'auth-guard.js','/platform.js':'platform.js',
    '/platform.css':'platform.css','/responsive.css':'responsive.css',
    '/nexus-logo.png':'nexus-logo.png'};
  if(!paths[pathname]){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(root,paths[pathname]);
  fs.readFile(file,(err,content)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    const mime=file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'text/html';
    res.writeHead(200,{'Content-Type':mime+(mime==='image/png'?'':'; charset=utf-8'),'Cache-Control':'no-store'});
    res.end(content);
  });
}).listen(port,'127.0.0.1',()=>console.log('Nex Playwright server listening on '+port));
