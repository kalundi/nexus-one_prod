#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// This script patches the hardcoded Google Maps API key placeholder with the actual key
// Run after build but before deployment

const root = process.cwd();
const assetsDir = path.join(root, 'assets');
const distAssetsDir = path.join(root, 'dist', 'assets');

// Get the API key from environment - note: in production, Netlify will handle this
// For now, we'll patch it to dynamically load from /api/integrations/config
const googleMapsKey = process.env.GOOGLE_MAPS_BROWSER_KEY || '';

const patchFiles = async (dir, isProduction = false) => {
  const jsFile = path.join(dir, 'index-drvotlb1.js');
  
  try {
    let content = readFileSync(jsFile, 'utf8');
    const originalContent = content;
    
    if (isProduction && googleMapsKey) {
      // In production with a key, replace the placeholder directly
      console.log(`[Patch] Replacing hardcoded Google Maps key in ${jsFile}`);
      content = content.replace(
        /var ud=`REDACTED_GOOGLE_API_KEY`/g,
        `var ud=\`${googleMapsKey}\``
      );
      content = content.replace(
        /var ud=`YOUR_GOOGLE_MAPS_API_KEY_HERE`/g,
        `var ud=\`${googleMapsKey}\``
      );
    } else {
      // Without a key, dynamically load from config endpoint
      // Patch the fd() function to fetch from config instead of using hardcoded key
      console.log(`[Patch] Configuring dynamic Google Maps key loading in ${jsFile}`);
      
      // Replace the Google Maps initialization to fetch the key dynamically
      const replacement = `var ud='',dd;async function fd(){if(!ud){try{let r=await fetch('/api/integrations/config');let c=await r.json();ud=c.googleMapsBrowserKey||''}catch(e){console.warn('Failed to fetch Google Maps config')}}return window.google?.maps?Promise.resolve(window.google.maps):dd||(dd=new Promise((e,t)=>{if(!ud){return t(new Error('Google Maps API key not configured'))}let n=document.querySelector(\`script[data-nexus-google-maps="true"]\`);if(n){n.addEventListener('load',()=>e(window.google.maps),{once:!0}),n.addEventListener('error',()=>t(Error('Google Maps could not be loaded.')),{once:!0});return}let r=\`nexusMapsReady_\${Date.now()}\`;window[r]=()=>{delete window[r],e(window.google.maps)};let i=document.createElement('script');i.src=\`https://maps.googleapis.com/maps/api/js?key=\${encodeURIComponent(ud)}&libraries=places&loading=async&callback=\${r}\`,i.async=!0,i.defer=!0,i.dataset.nexusGoogleMaps='true',i.onerror=()=>t(Error('Google Maps could not be loaded.')),document.head.appendChild(i)},dd))`;
      
      // This is complex to patch perfectly in minified code, so use a simpler approach
      // Just wrap the function
      const wrappedCode = `var ud='',dd;async function fd(){if(!ud){try{let r=await fetch('/api/integrations/config');let c=await r.json();ud=c.googleMapsBrowserKey||''}catch(e){console.warn('[Nexus] Google Maps not configured')}}`;
      content = content.replace(/var ud=`(?:REDACTED_)?GOOGLE_API_KEY`/g, wrappedCode);
    }
    
    if (content !== originalContent) {
      writeFileSync(jsFile, content, 'utf8');
      console.log(`✓ Patched ${jsFile}`);
    } else {
      console.log(`⚠ No changes made to ${jsFile}`);
    }
  } catch (err) {
    console.error(`✗ Failed to patch ${jsFile}:`, err.message);
  }
};

// Patch both locations
await patchFiles(assetsDir, !!googleMapsKey);
if (distAssetsDir !== assetsDir) {
  await patchFiles(distAssetsDir, !!googleMapsKey);
}

console.log('[Patch] Google Maps key patching complete');
