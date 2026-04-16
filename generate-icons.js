#!/usr/bin/env node
// Generate icons for the extension using pure Node.js
// Creates SVG icons and converts them to PNG using canvas

const fs = require('fs');
const path = require('path');

// Simple SVG icon for ImageVault
function createSVGIcon(size) {
  const pad = Math.floor(size * 0.15);
  const inner = size - pad * 2;
  const r = Math.floor(size * 0.2);
  
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c5cfc"/>
      <stop offset="100%" style="stop-color:#fc5c7d"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#grad)"/>
  <text x="${size/2}" y="${size/2 + size*0.15}" 
        text-anchor="middle" 
        font-size="${size * 0.55}" 
        font-family="Arial" 
        fill="white">⬇</text>
</svg>`;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const svg = createSVGIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
  console.log(`Created icon${size}.svg`);
});

console.log('Icons generated. Convert SVGs to PNGs for final use.');
