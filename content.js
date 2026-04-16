// ImageVault Pro - Content Script
// Adds hover overlay for quick image download

let hoverButton = null;
let currentImg = null;
let hideTimeout = null;

// Create the floating download button
function createHoverButton() {
  const btn = document.createElement('div');
  btn.id = 'imagevault-hover-btn';
  btn.innerHTML = `
    <style>
      #imagevault-hover-btn {
        position: fixed;
        z-index: 2147483647;
        background: linear-gradient(135deg, #7c5cfc, #9b7cff);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 6px 10px;
        font-family: 'Syne', -apple-system, sans-serif;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(124,92,252,0.4);
        display: none;
        align-items: center;
        gap: 5px;
        pointer-events: all;
        user-select: none;
        white-space: nowrap;
        transition: opacity 0.15s ease, transform 0.15s ease;
        letter-spacing: 0.3px;
      }
      #imagevault-hover-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(124,92,252,0.6);
      }
      #imagevault-hover-btn.visible {
        display: flex;
      }
      #imagevault-hover-btn .iv-icon {
        font-size: 13px;
      }
    </style>
    <span class="iv-icon">⬇</span>
    <span>Download</span>
  `;

  document.documentElement.appendChild(btn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (currentImg) {
      downloadCurrentImage();
    }
  });

  return btn;
}

function downloadCurrentImage() {
  if (!currentImg) return;
  const src = currentImg.currentSrc || currentImg.src ||
    currentImg.dataset.src || currentImg.dataset.lazySrc;

  if (!src) return;

  chrome.runtime.sendMessage({
    action: 'downloadImage',
    url: src,
    filename: null,
    watermarkRemoval: true,
    highQuality: true,
    format: 'original',
  });

  // Visual feedback
  if (hoverButton) {
    const span = hoverButton.querySelector('span:last-child');
    if (span) {
      span.textContent = '✓ Saved!';
      setTimeout(() => { if (span) span.textContent = 'Download'; }, 1500);
    }
  }
}

// Track mouse over images
document.addEventListener('mouseover', (e) => {
  const target = e.target;
  if (target.tagName === 'IMG' && target.src) {
    currentImg = target;
    clearTimeout(hideTimeout);
    showHoverButton(e);
  }
}, true);

document.addEventListener('mouseout', (e) => {
  const related = e.relatedTarget;
  if (related && related.id === 'imagevault-hover-btn') return;
  if (related && hoverButton && hoverButton.contains(related)) return;

  hideTimeout = setTimeout(() => {
    if (hoverButton) hoverButton.classList.remove('visible');
    currentImg = null;
  }, 300);
}, true);

// Keep button visible when hovering over it
document.addEventListener('mouseover', (e) => {
  if (hoverButton && (e.target === hoverButton || hoverButton.contains(e.target))) {
    clearTimeout(hideTimeout);
  }
}, true);

function showHoverButton(e) {
  if (!hoverButton) {
    hoverButton = createHoverButton();
  }

  const rect = e.target.getBoundingClientRect();
  const btnTop = Math.max(rect.top + 6, 6);
  const btnLeft = Math.min(rect.left + 6, window.innerWidth - 120);

  hoverButton.style.top = btnTop + 'px';
  hoverButton.style.left = btnLeft + 'px';
  hoverButton.classList.add('visible');
}
