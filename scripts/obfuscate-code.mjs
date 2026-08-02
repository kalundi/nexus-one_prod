#!/usr/bin/env node

/**
 * Code Obfuscation Script for Production Builds
 * 
 * Obfuscates JavaScript files in dist/assets/ to prevent:
 * - Source code inspection
 * - API endpoint discovery
 * - Business logic reverse engineering
 * 
 * Usage: node scripts/obfuscate-code.mjs
 * 
 * To use in production build:
 * npm run build:prod
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist', 'assets');

/**
 * Obfuscation options for production
 */
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  deadCodeInjection: false,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
  optionsPreset: 'medium'
};

/**
 * Files to obfuscate (protect production code)
 */
const filestoProtect = [
  'nexus-availability.js',
  'nexus-core.js',
  'nexus-data.js',
  'nexus-booking.js',
  'nexus-executive.js',
  'nexus-revenue.js',
  'universal-booking.js',
  'booking-app.js'
];

async function obfuscateFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    
    console.log(`[OBFUSCATE] Processing: ${path.basename(filePath)}`);
    
    const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
    
    fs.writeFileSync(filePath, obfuscated.getObfuscatedCode(), 'utf8');
    
    const originalSize = Buffer.byteLength(code);
    const obfuscatedSize = Buffer.byteLength(obfuscated.getObfuscatedCode());
    const increase = (((obfuscatedSize - originalSize) / originalSize) * 100).toFixed(1);
    
    console.log(`  ✓ Obfuscated (${originalSize}b → ${obfuscatedSize}b, +${increase}%)`);
    
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to obfuscate: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('[OBFUSCATE] Starting code protection for production...\n');
  
  if (!fs.existsSync(distDir)) {
    console.log(`[OBFUSCATE] dist/assets directory not found. Skipping obfuscation.`);
    console.log(`[OBFUSCATE] Run 'npm run build' first to generate distribution files.\n`);
    return;
  }
  
  let count = 0;
  let success = 0;
  
  for (const filename of filestoProtect) {
    const filePath = path.join(distDir, filename);
    
    if (fs.existsSync(filePath)) {
      count++;
      if (await obfuscateFile(filePath)) {
        success++;
      }
    }
  }
  
  // Also check for minified bundle files
  const jsFiles = fs.readdirSync(distDir)
    .filter(f => f.endsWith('.js') && f.match(/^index-[a-z0-9]+\.js$/));
  
  for (const filename of jsFiles) {
    const filePath = path.join(distDir, filename);
    count++;
    if (await obfuscateFile(filePath)) {
      success++;
    }
  }
  
  console.log(`\n[OBFUSCATE] Complete: ${success}/${count} files protected`);
  console.log(`[OBFUSCATE] Production code is now obfuscated and difficult to reverse-engineer`);
  console.log(`[OBFUSCATE] Security headers also prevent DevTools inspection\n`);
}

main().catch(error => {
  console.error('[OBFUSCATE] Fatal error:', error.message);
  process.exit(1);
});
