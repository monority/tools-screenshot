<div align="center">

# screenshot-win

Capture any desktop window in high resolution from the CLI or Node.js API.

</div>

---

## Features

- Multi-monitor support
- Upscaling via Lanczos3 + sharpening
- Auto-removes browser navigation bar (Firefox, Chrome, Edge...)
- No native compilation required
- Windows only

---

## Installation

```bash
npm install -g screenshot-win
```

Or for development:

```bash
git clone <repo>
cd screenshot-win
npm install
npm link
```

---

## CLI Usage

### Quick start

```bash
# Interactive mode (shows menu with arrow keys)
sw

# List open windows
sw --list

# Capture a window (2x by default)
sw --app firefox
sw --app msedge --scale 3

# Capture with specific width
sw --app firefox --width 1920

# WebP format
sw --app firefox --output capture.webp

# Keep the navigation bar
sw --app firefox --no-trim-nav
```

### Interactive Menu

Run `sw` without arguments to access the interactive menu with arrow key navigation:

1. **Select window** — Choose from detected windows
2. **Set scale** — Configure upscaling factor (default: 2x)
3. **Choose resolution** — Original, 1080p, 1440p, or 4K UHD
4. **Choose format** — PNG, JPG, or WebP output

---

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--app <name>` | — | Process or window name to match |
| `--scale <n>` | `2` | Upscaling factor (1, 2, 3...) |
| `--width <n>` | — | Target width in pixels (overrides scale) |
| `--output <path>` | auto | Override output path |
| `--trim-nav` | auto | Force nav bar removal |
| `--no-trim-nav` | — | Disable nav bar removal |
| `--list` | — | List all visible windows |

> Nav bar is automatically removed for: `firefox`, `chrome`, `msedge`, `opera`, `brave`, `vivaldi`

---

## API Usage

```js
const { capture, listWindows } = require('screenshot-win');

// List windows
const windows = listWindows();

// Capture a window
const result = await capture({
  app: 'firefox',
  scale: 2,
  output: './captures/firefox.png',
});

console.log(result.originalWidth);  // 1920
console.log(result.finalWidth);     // 3840
console.log(result.trimmedPx);      // 120
```

### API Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `app` | `string` | — | Process or window name |
| `scale` | `number` | `2` | Upscaling factor |
| `width` | `number` | — | Target width in pixels (overrides scale) |
| `output` | `string` | `./capture.png` | Output file path |
| `trimNav` | `boolean \| null` | `null` | `null` = auto, `true` = force, `false` = disable |

---

## How it works

1. Window detection — PowerShell + `DwmGetWindowAttribute` returns exact visual bounds
2. Display targeting — detects which monitor the window is on
3. Crop — extracts the window region from the screenshot
4. Nav bar trim — scans pixel row variance to detect browser UI boundary
5. Upscaling — Lanczos3 resize + sharpening via `sharp`

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `screenshot-desktop` | Cross-platform screen capture |
| `sharp` | Image processing, upscaling, sharpening, WebP support |
| `commander` | CLI argument parsing |
| `prompts` | Interactive menu interface |

---

## License

MIT