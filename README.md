# capture-win

Capture any desktop window in high resolution from the CLI or Node.js API.

- Multi-monitor support
- Upscaling via Lanczos3 + sharpening
- Auto-removes browser navigation bar (Firefox, Chrome, Edge...)
- No native compilation required

**Windows only.**

---

## Installation

```bash
# Local (recommended for dev)
git clone <repo>
cd capture-win
npm install
npm link

# From npm (once published)
npm install -g capture-win
```

---

## CLI

```bash
# List open windows
capture-win --list

# Capture a window (2x by default)
capture-win --app firefox
capture-win --app msedge --scale 3
capture-win --app Code --scale 2

# Custom output path
capture-win --app firefox --output ./my-capture.png

# Keep the navigation bar (disabled by default for browsers)
capture-win --app firefox --no-trim-nav
```

Captures are saved in a `captures/` folder in the current directory, named with a timestamp:
```
captures/firefox-2026-04-29T12-00-00-000Z.png
```

### Options

| Option | Default | Description |
|---|---|---|
| `--app <name>` | — | Process or window name to match |
| `--scale <n>` | `2` | Upscaling factor (1, 2, 3...) |
| `--output <path>` | auto | Override output path (.png or .jpg) |
| `--trim-nav` | auto | Force nav bar removal |
| `--no-trim-nav` | — | Disable nav bar removal |
| `--list` | — | List all visible windows |

> Nav bar is automatically removed for: `firefox`, `chrome`, `msedge`, `opera`, `brave`, `vivaldi`

---

## API

```js
const { capture, listWindows } = require('capture-win');

// List windows
const windows = listWindows();
// [{ title: 'Mozilla Firefox', process: 'firefox' }, ...]

// Capture
const result = await capture({
  app: 'firefox',
  scale: 2,
  output: './captures/firefox.png',
});

console.log(result.originalWidth);  // 1920
console.log(result.finalWidth);     // 3840
console.log(result.trimmedPx);      // 120 (nav bar removed)
console.log(result.output);         // './captures/firefox.png'
```

### `capture(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `app` | `string` | — | Process or window name |
| `scale` | `number` | `2` | Upscaling factor |
| `output` | `string` | `./capture.png` | Output file path |
| `trimNav` | `boolean \| null` | `null` | `null` = auto, `true` = force, `false` = disable |

---

## How it works

1. **Window detection** — PowerShell + `DwmGetWindowAttribute` returns exact visual bounds (no shadow margins)
2. **Display targeting** — detects which monitor the window is on, screenshots only that display
3. **Crop** — extracts the window region from the screenshot
4. **Nav bar trim** — scans pixel row variance to detect where the browser UI ends and content begins
5. **Upscaling** — Lanczos3 resize + sharpening via `sharp`

---

## Dependencies

| Package | Role |
|---|---|
| `screenshot-desktop` | Cross-platform screen capture |
| `sharp` | Image processing, upscaling, sharpening |
| `commander` | CLI argument parsing |
