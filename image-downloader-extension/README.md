# 🖼 ImageVault Pro — Browser Extension

A powerful Chrome/Edge extension for downloading high-quality images from any website, with AI-powered watermark removal.

---

## ✨ Features

- **Scan any page** — Detects all images including lazy-loaded, CSS backgrounds, `<picture>` sources, SVGs, and Open Graph images
- **Watermark Removal** — Advanced algorithm detects and removes semi-transparent watermarks (text overlays, logos, copyright stamps)
- **Max Resolution** — Strips size constraints from CDN URLs to fetch the highest available quality
- **Hover Download** — Hover over any image on any page and click the floating ⬇ button
- **Right-Click Menu** — Right-click any image → "Download with ImageVault" or "Download & Remove Watermark"
- **Format Conversion** — Save as Original, PNG, JPG, or WebP
- **Bulk Download** — Select and download multiple images at once
- **Skip Tiny Images** — Filter out icons and spacer images automatically

---

## 📦 Installation

### Method 1: Load Unpacked (Developer Mode)
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder (`image-downloader-extension/`)
5. The extension icon appears in your toolbar ✓

### Method 2: Edge Browser
1. Go to `edge://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder

---

## 🚀 How to Use

### Scan & Download
1. Click the **ImageVault** icon in your toolbar
2. Click **🔍 Scan Page** to detect all images
3. Click thumbnails to select (click again to deselect)
4. Click **⬇ Download Selected**

### Quick Download (Hover)
- Hover your mouse over any image on any webpage
- A purple **⬇ Download** button appears
- Click it to instantly download with watermark removal

### Right-Click Download
- Right-click any image
- Choose **⬇ Download with ImageVault** (original)
- Or **🚫 Download & Remove Watermark**

---

## ⚙️ Options

| Option | Description |
|--------|-------------|
| **Watermark Removal** | Detects and removes semi-transparent watermarks using canvas inpainting |
| **Max Resolution** | Strips CDN size parameters, fetches srcset highest quality |
| **Skip Tiny Images** | Ignores images smaller than 100×100px |
| **Lazy-Load Images** | Captures `data-src`, `data-lazy-src` attributes |

---

## 🔧 Watermark Removal — How It Works

The watermark removal uses a multi-step canvas-based algorithm:

1. **Detection** — Analyzes pixel alpha values to find semi-transparent regions characteristic of text/logo watermarks
2. **Pattern Matching** — Identifies low-saturation (gray/white) pixels in the typical alpha range for overlaid watermarks
3. **Mask Building** — Creates a precise pixel mask of watermark regions and dilates edges for clean coverage
4. **Inpainting** — Fills watermark pixels with weighted samples from surrounding non-watermark pixels
5. **Smoothing** — Applies a light Gaussian pass to blend inpainted regions naturally

> **Note:** Works best on semi-transparent text/logo watermarks. Stock photo watermarks (Shutterstock, Getty) that are heavily embedded in the image are automatically detected by URL/alt-text and flagged in the UI.

---

## 📁 File Structure

```
image-downloader-extension/
├── manifest.json       # Extension config (Manifest V3)
├── popup.html          # Main UI
├── popup.js            # Popup logic, image scanning
├── background.js       # Service worker, downloads, image processing
├── content.js          # In-page hover button
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🛡️ Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read current tab to scan images |
| `scripting` | Inject scan script into page |
| `downloads` | Save files to disk |
| `storage` | Remember settings and download count |
| `contextMenus` | Right-click download option |
| `host_permissions: <all_urls>` | Fetch images from any domain |

---

## ⚠️ Notes

- Downloaded images are saved to your **Downloads/ImageVault/** folder
- Some images may be protected by CORS and will fall back to direct download
- Watermark removal quality depends on watermark type — works best on semi-transparent overlays
- Always respect copyright and terms of service when downloading images
