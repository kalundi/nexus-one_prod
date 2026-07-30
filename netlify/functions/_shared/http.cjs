function json(statusCode,body,extra={}){return {statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra},body:JSON.stringify(body)}}
function parseBody(event){try{return event.body?JSON.parse(event.body):{}}catch{throw Object.assign(new Error('Invalid JSON body'),{statusCode:400})}}
function bearer(event){const h=event.headers.authorization||event.headers.Authorization||'';return h.startsWith('Bearer ')?h.slice(7):''}
function routePath(event){const raw=event.path||'';return raw.replace(/^\/\.netlify\/functions\/api\/?/,'').replace(/^\/api\/?/,'').split('/').filter(Boolean)}
module.exports={json,parseBody,bearer,routePath};
