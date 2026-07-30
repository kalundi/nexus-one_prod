#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const ROOT_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : PROJECT_ROOT;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function resolvePath(requestPath) {
  let filePath = path.join(ROOT_DIR, requestPath);
  
  // Security: prevent directory traversal
  const realPath = path.resolve(filePath);
  if (!realPath.startsWith(path.resolve(ROOT_DIR))) {
    return null;
  }
  
  // If it's a directory, try index.html
  if (fs.existsSync(realPath) && fs.statSync(realPath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  
  return filePath;
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = resolvePath(url.pathname);

  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  // Check if it's a file
  if (!fs.statSync(filePath).isFile()) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Read and serve the file
  try {
    const content = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    const cacheControl = mimeType.includes('javascript') || mimeType.includes('css') 
      ? 'no-cache, must-revalidate'
      : 'public, max-age=3600';
    
    res.writeHead(200, {
      'Content-Type': `${mimeType}; charset=utf-8`,
      'Cache-Control': cacheControl,
      'Content-Length': content.length,
    });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

const PORT = 8000;
const HOST = '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`\n📱 Nexus Preview Server running at http://${HOST}:${PORT}`);
  console.log(`📂 Serving files from: ${ROOT_DIR}`);
  console.log(`🔗 Visit: http://${HOST}:${PORT}/booking-app.html\n`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  server.close();
  process.exit(0);
});
