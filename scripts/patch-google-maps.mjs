#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Fix any corrupted Google Maps key injection in the bundle.
// Previous patch attempts may have left broken syntax like:
//   return _ud_promise},dd;async function fd
// This script both cleans up prior bad patches and removes fresh placeholders.

const root = process.cwd();
const files = [
  path.join(root, 'assets', 'index-drvotlb1.js'),
  path.join(root, '__deploy_temp', 'assets', 'index-drvotlb1.js'),
  path.join(root, 'dist', 'assets', 'index-drvotlb1.js'),
];

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf8');
    let changed = false;

    // Fix previously-broken patch: stray },dd; separator between function and var declaration
    if (content.includes('_ud_promise},dd;async function fd')) {
      content = content.replace(/_ud_promise},dd;async function fd/g, '_ud_promise};var dd;async function fd');
      changed = true;
      console.log(`✓ Fixed broken patch syntax in ${path.basename(file)}`);
    }

    // Add empty-key guard so Maps won't try to load (and show error popup) when no key configured
    const guardedFd = '_ud_promise};var dd;async function fd(){await _fetchGoogleMapsKey();if(!ud)return Promise.reject(new Error("Google Maps API key not configured"));return window.google?.maps?Promise.resolve(window.google.maps):dd||';
    const ungardedFd = '_ud_promise};var dd;async function fd(){await _fetchGoogleMapsKey();return window.google?.maps?Promise.resolve(window.google.maps):dd||';
    if (content.includes(ungardedFd)) {
      content = content.replace(ungardedFd, guardedFd);
      changed = true;
      console.log(`✓ Added empty-key guard to fd() in ${path.basename(file)}`);
    }

    // Fix fresh placeholder (should not exist after first build, but handle just in case)
    if (content.includes('var ud=`REDACTED_GOOGLE_API_KEY`')) {
      content = content.replace(/var ud=`REDACTED_GOOGLE_API_KEY`/g, 'var ud=""');
      changed = true;
      console.log(`✓ Removed REDACTED_GOOGLE_API_KEY placeholder from ${path.basename(file)}`);
    }
    if (content.includes('var ud=`YOUR_GOOGLE_MAPS_API_KEY_HERE`')) {
      content = content.replace(/var ud=`YOUR_GOOGLE_MAPS_API_KEY_HERE`/g, 'var ud=""');
      changed = true;
      console.log(`✓ Removed YOUR_GOOGLE_MAPS_API_KEY_HERE placeholder from ${path.basename(file)}`);
    }

    if (changed) writeFileSync(file, content, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`⚠ Could not patch ${file}:`, err.message);
  }
}

console.log('[Build] Google Maps bundle fix complete');



