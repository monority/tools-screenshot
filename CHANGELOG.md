# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Navbar removal on browsers whose toolbar background reads as uniformly lit (Zen and other Firefox forks): a new chrome-block strategy cuts at the sustained density drop where page content starts.
- Navbar detector no longer returns a 15px stub when the toolbar occupies the very top of the window.

### Added

- Synthetic navbar fixture for the Zen profile (`zen-dark-100.png`) covering the uniform chrome-block boundary.

## [1.0.0] - 2026-11-14

### Added

- Windows CLI (`sw`, `screenshot-win`) and Node API to capture a specific desktop window.
- Automatic browser navbar removal with API content-bounds cross-validation and pixel analysis.
- Multi-monitor support with best-overlap display selection.
- Upscaling via Lanczos3 and sharpening with `sharp`.
- PNG, JPEG and WebP output.
- Interactive menu with scale, resolution and format selection.
- Exact window targeting through `windowId` / `--id`.
- Background-window capture through a `PrintWindow` fallback.
- Navbar fixture baselines (light/dark/DPI/negative) with SHA-256 stability checks.
- Node test suite, ESLint, Prettier, TypeScript check, coverage thresholds and Windows CI.

### Changed

- Package renamed to `tools-screenshot` to avoid the unrelated `screenshot-win` package on npm.
- Capture pipeline now decodes the screenshot once and keeps raw pixels through trimming and enhancement.
- Requires Node.js 20.9+ and Windows.
