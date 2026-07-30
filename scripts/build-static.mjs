import {cp,mkdir,rm,readdir,access} from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
const root=process.cwd(),dist=path.join(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
const excluded=new Set(['dist','node_modules','netlify','database','scripts','docs','.git','__deploy_temp']);
for(const item of await readdir(root,{withFileTypes:true})){
 if(excluded.has(item.name)||item.name==='package.json'||item.name==='package-lock.json')continue;
 if(item.isFile()&&item.name.toLowerCase().endsWith('.md'))continue;
 await cp(path.join(root,item.name),path.join(dist,item.name),{recursive:true});
}
try{await access(path.join(root,'__deploy_temp','index.html'));await cp(path.join(root,'__deploy_temp','index.html'),path.join(dist,'index.html'));console.log('Root index.html created from __deploy_temp.');}catch(e){console.warn('No deploy-temp index.html found; root entry page was not generated.');}
console.log('Static application copied to dist.');
// Patch Google Maps API key configuration
try{await new Promise((resolve,reject)=>{const proc=spawn('node',['scripts/patch-google-maps.mjs'],{cwd:root,stdio:'inherit'});proc.on('exit',code=>code===0?resolve():reject(new Error(`Patch script exited with code ${code}`)))});}catch(e){console.warn('Note: Google Maps patching incomplete -',e.message);}
await rm(path.join(dist,'__deploy_temp'),{recursive:true,force:true});
