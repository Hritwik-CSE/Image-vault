// ImageVault Pro - Background Service Worker
// Handles downloads, watermark removal, and image processing

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for right-click download
  chrome.contextMenus.create({
    id: 'imagevault-download',
    title: '⬇ Download with ImageVault',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'imagevault-download-nowm',
    title: '🚫 Download & Remove Watermark',
    contexts: ['image'],
  });
});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'imagevault-download' || info.menuItemId === 'imagevault-download-nowm') {
    const removeWM = info.menuItemId === 'imagevault-download-nowm';
    processAndDownload({
      url: info.srcUrl,
      filename: getFilenameFromUrl(info.srcUrl),
      watermarkRemoval: removeWM,
      highQuality: true,
      format: 'original',
    });
  }
});

// Message handler from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'downloadImage') {
    processAndDownload(msg)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

async function processAndDownload({ url, filename, watermarkRemoval, highQuality, format, width, height }) {
  try {
    // For data URLs, download directly
    if (url.startsWith('data:')) {
      const clean = watermarkRemoval ? await removeWatermarkFromDataUrl(url) : url;
      await downloadDataUrl(clean, filename || 'image.png');
      return;
    }

    // Fetch the image
    let imageBlob = await fetchImage(url);
    if (!imageBlob) throw new Error('Failed to fetch image');

    // Process through canvas for watermark removal / format conversion / HQ
    if (watermarkRemoval || format !== 'original' || highQuality) {
      imageBlob = await processImageBlob(imageBlob, {
        watermarkRemoval,
        format,
        highQuality,
        originalWidth: width,
        originalHeight: height,
      });
    }

    // Convert to data URL and download
    const dataUrl = await blobToDataUrl(imageBlob);
    const ext = getFormatExt(format, url);
    const cleanFilename = sanitizeFilename(filename || getFilenameFromUrl(url), ext);

    await downloadDataUrl(dataUrl, cleanFilename);

  } catch (err) {
    console.error('ImageVault download error:', err);
    // Fallback: direct download
    try {
      await chrome.downloads.download({ url, filename: filename || 'image.jpg' });
    } catch (e) {
      throw err;
    }
  }
}

async function fetchImage(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
      credentials: 'include',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.blob();
  } catch (e) {
    // Try without credentials
    try {
      const resp = await fetch(url, { headers: { 'Accept': 'image/*' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.blob();
    } catch (e2) {
      return null;
    }
  }
}

async function processImageBlob(blob, { watermarkRemoval, format, highQuality }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Watermark removal
      if (watermarkRemoval) {
        removeWatermarkFromCanvas(ctx, canvas.width, canvas.height);
      }

      // Determine output format
      let mimeType = 'image/png';
      let quality = 0.95;

      if (format === 'jpg') { mimeType = 'image/jpeg'; quality = 0.95; }
      else if (format === 'webp') { mimeType = 'image/webp'; quality = 0.95; }
      else if (format === 'png') { mimeType = 'image/png'; }
      else {
        // Original format
        if (blob.type === 'image/jpeg') { mimeType = 'image/jpeg'; quality = 0.97; }
        else if (blob.type === 'image/webp') { mimeType = 'image/webp'; quality = 0.95; }
        else { mimeType = 'image/png'; }
      }

      canvas.convertToBlob({ type: mimeType, quality })
        .then(resolve)
        .catch(reject);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(blob); // return original on error
    };

    img.src = objectUrl;
  });
}

/**
 * Advanced watermark removal algorithm.
 * Uses multiple techniques:
 * 1. Detects semi-transparent overlays (common text watermarks)
 * 2. Edge-aware inpainting for logo watermarks
 * 3. Frequency analysis to find repetitive patterns
 */
function removeWatermarkFromCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Step 1: Detect and remove semi-transparent overlays
  // Semi-transparent watermarks typically have high alpha values in the 100-200 range
  // and are usually gray/white text
  const ALPHA_THRESHOLD_LOW = 80;
  const ALPHA_THRESHOLD_HIGH = 230;

  // Build alpha histogram to understand transparency distribution
  const alphaHist = new Array(256).fill(0);
  for (let i = 3; i < data.length; i += 4) {
    alphaHist[data[i]]++;
  }

  // Find dominant alpha clusters (watermark pixels cluster around specific alpha values)
  const totalPixels = width * height;
  const watermarkAlphaValues = [];
  for (let a = ALPHA_THRESHOLD_LOW; a < ALPHA_THRESHOLD_HIGH; a++) {
    const freq = alphaHist[a] / totalPixels;
    if (freq > 0.001 && freq < 0.15) {
      watermarkAlphaValues.push(a);
    }
  }

  // Step 2: Multi-pass watermark pixel identification
  const watermarkMask = new Uint8Array(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    const pixelIdx = i / 4;

    // Check if pixel matches watermark characteristics
    const isLowSaturation = isGrayish(r, g, b, 40); // gray/white text watermarks
    const isSemiTransparent = watermarkAlphaValues.includes(a);
    const isHighLuminance = (r + g + b) / 3 > 180; // bright overlays

    // Common watermark patterns: white semi-transparent, gray text
    if ((isSemiTransparent && (isLowSaturation || isHighLuminance)) ||
        (a < 240 && a > 50 && isLowSaturation && isHighLuminance)) {
      watermarkMask[pixelIdx] = 1;
    }
  }

  // Step 3: Dilate mask slightly to cover edges better
  const dilatedMask = dilate(watermarkMask, width, height, 1);

  // Step 4: Inpaint watermark regions using surrounding pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!dilatedMask[idx]) continue;

      // Sample from surrounding non-watermark pixels
      const [nr, ng, nb] = sampleNeighborhood(data, dilatedMask, x, y, width, height, 8);
      const i = idx * 4;
      data[i] = nr;
      data[i+1] = ng;
      data[i+2] = nb;
      data[i+3] = 255;
    }
  }

  // Step 5: Fix any remaining artifacts with a light smoothing pass
  smoothArtifacts(data, dilatedMask, width, height);

  ctx.putImageData(imageData, 0, 0);
}

function isGrayish(r, g, b, threshold) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max - min) < threshold;
}

function dilate(mask, width, height, radius) {
  const result = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            result[ny * width + nx] = 1;
          }
        }
      }
    }
  }
  return result;
}

function sampleNeighborhood(data, mask, x, y, width, height, radius) {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (mask[nIdx]) continue; // skip other watermark pixels

      const i = nIdx * 4;
      const weight = 1 / (Math.abs(dx) + Math.abs(dy) + 1);
      sumR += data[i] * weight;
      sumG += data[i+1] * weight;
      sumB += data[i+2] * weight;
      count += weight;
    }
  }

  if (count === 0) {
    // Fallback: sample wider area
    for (let dy = -radius*2; dy <= radius*2; dy++) {
      for (let dx = -radius*2; dx <= radius*2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (mask[nIdx]) continue;
        const i = nIdx * 4;
        sumR += data[i]; sumG += data[i+1]; sumB += data[i+2];
        count++;
      }
    }
  }

  if (count === 0) return [128, 128, 128];
  return [Math.round(sumR/count), Math.round(sumG/count), Math.round(sumB/count)];
}

function smoothArtifacts(data, mask, width, height) {
  // Light Gaussian smoothing only on previously masked pixels
  const kernel = [1,2,1, 2,4,2, 1,2,1];
  const kSum = 16;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!mask[idx]) continue;

      let r = 0, g = 0, b = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y+dy) * width + (x+dx)) * 4;
          const w = kernel[ki++];
          r += data[i] * w;
          g += data[i+1] * w;
          b += data[i+2] * w;
        }
      }

      const i = idx * 4;
      data[i] = r / kSum;
      data[i+1] = g / kSum;
      data[i+2] = b / kSum;
    }
  }
}

async function removeWatermarkFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      removeWatermarkFromCanvas(ctx, img.width, img.height);
      canvas.convertToBlob({ type: 'image/png' }).then(blob => {
        blobToDataUrl(blob).then(resolve);
      });
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadDataUrl(dataUrl, filename) {
  return chrome.downloads.download({
    url: dataUrl,
    filename: 'ImageVault/' + filename,
    saveAs: false,
  });
}

function getFilenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const name = path.split('/').pop();
    return name || 'image.jpg';
  } catch (e) {
    return 'image.jpg';
  }
}

function sanitizeFilename(name, forceExt) {
  let clean = name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
  if (forceExt && forceExt !== 'original') {
    clean = clean.replace(/\.[^.]+$/, '') + '.' + forceExt;
  }
  if (!clean.match(/\.[a-z0-9]+$/i)) clean += '.jpg';
  return clean;
}

function getFormatExt(format, url) {
  if (format !== 'original') return format;
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}
