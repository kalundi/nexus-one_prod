const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function webHtmlFiles(){
 const files=[];
 const visit=folder=>fs.readdirSync(folder,{withFileTypes:true}).forEach(entry=>{
  if(['node_modules','dist','.git','test-results','mobile'].includes(entry.name))return;
  const target=path.join(folder,entry.name);
  if(entry.isDirectory())visit(target);
  else if(entry.name.endsWith('.html'))files.push(target);
 });
 visit(root);
 return files;
}

test('every browser page uses the shared responsive system and viewport',()=>{
 const files=webHtmlFiles();
 assert.equal(files.length,43);
 files.forEach(file=>{
  const source=fs.readFileSync(file,'utf8'),name=path.relative(root,file);
  assert.match(source,/<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width[^"']*initial-scale=1/i,`${name} needs the standard viewport`);
  assert.match(source,/<link\s+rel=["']stylesheet["']\s+href=["']\/responsive\.css\?v=1["']>/i,`${name} needs responsive.css`);
 });
});

test('responsive system defines one breakpoint and fluid-layout contract',()=>{
 const css=fs.readFileSync(path.join(root,'responsive.css'),'utf8');
 assert.match(css,/Breakpoints: phone <= 760px, compact\/tablet <= 1024px/);
 assert.match(css,/width:min\(calc\(100% - \(2 \* var\(--nexus-shell-gutter\)\)\),var\(--nexus-shell-max\)\)/);
 assert.match(css,/@media\(max-width:1024px\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/font-size:clamp\(/);
 assert.match(css,/min-height:var\(--nexus-touch-target\)/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/img,video\{height:auto\}/);
});
