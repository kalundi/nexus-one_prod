'use strict';
// Serves ONLY the Ask Nex page and static assets for local Playwright checks.
// The real visitor-assistant HTTP endpoint is intercepted in the browser tests.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.NEX_E2E_PORT||4179);
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const paths={'/ask-nex.html':'ask-nex.html','/ask-nex':'ask-nex.html','/platform.css':'platform.css'};
  if(!paths[pathname]){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(root,paths[pathname]);
  fs.readFile(file,(err,content)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(content);
  });
}).listen(port,'127.0.0.1',()=>console.log('Nex Playwright server listening on '+port));
