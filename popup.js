// ImageVault Pro - Popup Script

let foundImages = [];
let selectedImages = new Set();
let downloadedCount = 0;
let selectedFormat = 'original';

const elements = {
  btnScan: document.getElementById('btn-scan'),
  btnSelectAll: document.getElementById('btn-select-all'),
  btnDownload: document.getElementById('btn-download'),
  btnClear: document.getElementById('btn-clear'),
  imageGrid: document.getElementById('image-grid'),
  emptyState: document.getElementById('empty-state'),
  imgCount: document.getElementById('img-count'),
  statFound: document.getElementById('stat-found'),
  statSelected: document.getElementById('stat-selected'),
  statDownloaded: document.getElementById('stat-downloaded'),
  loading: document.getElementById('loading'),
  loadingText: document.getElementById('loading-text'),
  progressWrap: document.getElementById('progress-wrap'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  progressPct: document.getElementById('progress-pct'),
  optWatermark: document.getElementById('opt-watermark'),
  optHq: document.getElementById('opt-hq'),
  optSkipSmall: document.getElementById('opt-skip-small'),
  optLazy: document.getElementById('opt-lazy'),
  notif: document.getElementById('notif'),
};

// Load saved settings
chrome.storage.local.get(['downloadedCount', 'settings'], (data) => {
  if (data.downloadedCount) {
    downloadedCount = data.downloadedCount;
    elements.statDownloaded.textContent = downloadedCount;
  }
  if (data.settings) {
    elements.optWatermark.checked = data.settings.watermark ?? true;
    elements.optHq.checked = data.settings.hq ?? true;
    elements.optSkipSmall.checked = data.settings.skipSmall ?? true;
    elements.optLazy.checked = data.settings.lazy ?? true;
  }
});

// Format selector
document.querySelectorAll('.format-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedFormat = btn.dataset.fmt;
  });
});

// Save settings on change
[elements.optWatermark, elements.optHq, elements.optSkipSmall, elements.optLazy].forEach(el => {
  el.addEventListener('change', saveSettings);
});

function saveSettings() {
  chrome.storage.local.set({
    settings: {
      watermark: elements.optWatermark.checked,
      hq: elements.optHq.checked,
      skipSmall: elements.optSkipSmall.checked,
      lazy: elements.optLazy.checked,
    }
  });
}

// Scan page
elements.btnScan.addEventListener('click', async () => {
  showLoading('Scanning page for images...');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanPageImages,
      args: [{
        skipSmall: elements.optSkipSmall.checked,
        lazy: elements.optLazy.checked,
      }]
    });

    const images = results[0].result || [];
    hideLoading();

    if (images.length === 0) {
      showNotif('No images found on this page', 'error');
      return;
    }

    foundImages = images;
    selectedImages.clear();
    renderImages();
    updateStats();
    showNotif(`Found ${images.length} image${images.length !== 1 ? 's' : ''}`, 'success');

  } catch (err) {
    hideLoading();
    showNotif('Cannot scan this page', 'error');
    console.error(err);
  }
});

// Select all toggle
elements.btnSelectAll.addEventListener('click', () => {
  if (selectedImages.size === foundImages.length) {
    selectedImages.clear();
    elements.btnSelectAll.innerHTML = '<span>☑</span> Select All';
  } else {
    foundImages.forEach((_, i) => selectedImages.add(i));
    elements.btnSelectAll.innerHTML = '<span>☐</span> Deselect All';
  }
  renderImages();
  updateStats();
});

// Download selected
elements.btnDownload.addEventListener('click', async () => {
  if (selectedImages.size === 0) return;

  const toDownload = [...selectedImages].map(i => foundImages[i]);
  const watermarkEnabled = elements.optWatermark.checked;
  const hqEnabled = elements.optHq.checked;
  
  showProgress();

  let completed = 0;
  const total = toDownload.length;

  for (const img of toDownload) {
    try {
      updateProgress(completed, total, `Processing ${img.filename || 'image'}...`);
      
      // Send to background for download with processing
      await chrome.runtime.sendMessage({
        action: 'downloadImage',
        url: img.url,
        filename: img.filename,
        watermarkRemoval: watermarkEnabled,
        highQuality: hqEnabled,
        format: selectedFormat,
        width: img.width,
        height: img.height,
      });

      completed++;
      downloadedCount++;
      updateProgress(completed, total, `Downloaded ${completed}/${total}`);

    } catch (err) {
      console.error('Download error:', err);
      completed++;
    }
  }

  chrome.storage.local.set({ downloadedCount });
  elements.statDownloaded.textContent = downloadedCount;
  
  hideProgress();
  showNotif(`✓ Downloaded ${completed} image${completed !== 1 ? 's' : ''}`, 'success');
});

// Clear
elements.btnClear.addEventListener('click', () => {
  foundImages = [];
  selectedImages.clear();
  elements.imageGrid.innerHTML = '';
  elements.imageGrid.style.display = 'none';
  elements.emptyState.style.display = 'block';
  elements.imgCount.textContent = '0 images';
  elements.btnDownload.disabled = true;
  elements.btnSelectAll.innerHTML = '<span>☑</span> Select All';
  updateStats();
});

// Render images
function renderImages() {
  const grid = elements.imageGrid;
  grid.innerHTML = '';

  if (foundImages.length === 0) {
    grid.style.display = 'none';
    elements.emptyState.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  elements.emptyState.style.display = 'none';
  elements.imgCount.textContent = `${foundImages.length} image${foundImages.length !== 1 ? 's' : ''}`;

  foundImages.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'image-item' + (selectedImages.has(i) ? ' selected' : '');
    item.dataset.index = i;

    const image = document.createElement('img');
    image.src = img.url;
    image.loading = 'lazy';
    image.onerror = () => { image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼</text></svg>'; };

    item.appendChild(image);

    if (img.hasWatermark) {
      const badge = document.createElement('div');
      badge.className = 'watermark-badge';
      badge.textContent = 'WM';
      item.appendChild(badge);
    }

    item.addEventListener('click', () => {
      if (selectedImages.has(i)) {
        selectedImages.delete(i);
        item.classList.remove('selected');
      } else {
        selectedImages.add(i);
        item.classList.add('selected');
      }
      updateStats();
    });

    grid.appendChild(item);
  });

  elements.btnDownload.disabled = selectedImages.size === 0;
}

function updateStats() {
  elements.statFound.textContent = foundImages.length;
  elements.statSelected.textContent = selectedImages.size;
  elements.btnDownload.disabled = selectedImages.size === 0;
}

function showLoading(text) {
  elements.loadingText.textContent = text;
  elements.loading.classList.add('active');
}

function hideLoading() {
  elements.loading.classList.remove('active');
}

function showProgress() {
  elements.progressWrap.style.display = 'block';
  updateProgress(0, 1, 'Starting...');
}

function hideProgress() {
  setTimeout(() => {
    elements.progressWrap.style.display = 'none';
  }, 1000);
}

function updateProgress(done, total, text) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  elements.progressFill.style.width = pct + '%';
  elements.progressPct.textContent = pct + '%';
  elements.progressText.textContent = text;
}

let notifTimer;
function showNotif(message, type = '') {
  const el = elements.notif;
  el.textContent = message;
  el.className = 'notif' + (type ? ' ' + type : '') + ' show';
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => { el.classList.remove('show'); }, 2500);
}

// This function is injected into the page
function scanPageImages({ skipSmall, lazy }) {
  const images = [];
  const seen = new Set();

  function addImage(url, el) {
    if (!url || seen.has(url)) return;
    if (url.startsWith('data:') && url.length < 1000) return; // skip tiny data URIs

    try {
      // Resolve relative URLs
      const abs = new URL(url, location.href).href;
      if (seen.has(abs)) return;
      seen.add(abs);

      let w = 0, h = 0;
      if (el && el.naturalWidth) { w = el.naturalWidth; h = el.naturalHeight; }
      else if (el) { w = el.offsetWidth || el.width || 0; h = el.offsetHeight || el.height || 0; }

      if (skipSmall && (w > 0 && w < 100 || h > 0 && h < 100)) return;
      if (skipSmall && (h > 0 && h < 100)) return;

      // Detect watermarks heuristically
      const hasWatermark = detectWatermark(abs, el);

      // Try to get highest res version
      let highResUrl = getHighResUrl(abs, el);

      const ext = abs.split('.').pop().split('?')[0].toLowerCase();
      const filename = 'image_' + (images.length + 1) + '.' + (ext || 'jpg');

      images.push({ url: highResUrl || abs, filename, width: w, height: h, hasWatermark });

    } catch (e) { /* skip invalid URLs */ }
  }

  function detectWatermark(url, el) {
    const lower = url.toLowerCase();
    const watermarkKeywords = ['watermark', 'copyright', 'getty', 'shutterstock', 'dreamstime', 'istock', '123rf', 'alamy', 'adobe', 'depositphotos'];
    if (watermarkKeywords.some(kw => lower.includes(kw))) return true;
    if (el) {
      const alt = (el.alt || '').toLowerCase();
      const title = (el.title || '').toLowerCase();
      if (watermarkKeywords.some(kw => alt.includes(kw) || title.includes(kw))) return true;
    }
    return false;
  }

  function getHighResUrl(url, el) {
    // Try srcset for higher res
    if (el && el.srcset) {
      const sources = el.srcset.split(',').map(s => s.trim().split(/\s+/));
      const sorted = sources
        .filter(s => s.length >= 1)
        .sort((a, b) => {
          const wa = parseFloat(a[1]) || 1;
          const wb = parseFloat(b[1]) || 1;
          return wb - wa;
        });
      if (sorted.length > 0 && sorted[0][0]) {
        try { return new URL(sorted[0][0], location.href).href; } catch (e) {}
      }
    }

    // Common patterns to get higher res
    let highRes = url;
    // Remove size constraints from common CDNs
    highRes = highRes
      .replace(/[?&]w=\d+/g, '')
      .replace(/[?&]h=\d+/g, '')
      .replace(/[?&]width=\d+/g, '')
      .replace(/[?&]height=\d+/g, '')
      .replace(/[?&]resize=\d+/g, '')
      .replace(/[?&]size=\d+/g, '')
      .replace(/[?&]quality=\d+/gi, '')
      .replace(/\/thumb\//i, '/full/')
      .replace(/\/small\//i, '/large/')
      .replace(/\/medium\//i, '/large/')
      .replace(/_small\./i, '_large.')
      .replace(/_thumb\./i, '_full.')
      .replace(/_200\./i, '_1200.')
      .replace(/_400\./i, '_1200.')
      .replace(/_600\./i, '_1200.');

    return highRes !== url ? highRes : null;
  }

  // 1. All <img> elements
  document.querySelectorAll('img').forEach(img => {
    addImage(img.currentSrc || img.src, img);
    if (lazy) {
      const lazySrc = img.dataset.src || img.dataset.lazySrc || img.dataset.original || img.dataset.imgSrc;
      if (lazySrc) addImage(lazySrc, img);
    }
  });

  // 2. CSS background images
  document.querySelectorAll('*').forEach(el => {
    const bg = window.getComputedStyle(el).backgroundImage;
    const match = bg.match(/url\(["']?([^"')]+)["']?\)/g);
    if (match) {
      match.forEach(m => {
        const url = m.replace(/url\(["']?|["']?\)/g, '');
        addImage(url, null);
      });
    }
  });

  // 3. <picture> sources
  document.querySelectorAll('picture source').forEach(source => {
    const srcset = source.srcset;
    if (srcset) {
      srcset.split(',').forEach(s => {
        const url = s.trim().split(/\s+/)[0];
        if (url) addImage(url, null);
      });
    }
  });

  // 4. SVG images
  document.querySelectorAll('image[href], image[xlink\\:href]').forEach(img => {
    addImage(img.href?.baseVal || img.getAttribute('xlink:href'), img);
  });

  // 5. Open graph / meta images
  document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(meta => {
    addImage(meta.content, null);
  });

  return images;
}
