#!/usr/bin/env node

const { program } = require('commander');
const { capture, listWindows } = require('../src/index');
const path = require('path');
const fs = require('fs');

program
  .name('capture-win')
  .description('Capture a specific desktop window in high resolution')
  .version('1.0.0');

program
  .option('--app <name>', 'Process or window name to capture (e.g. firefox, Code)')
  .option('--output <path>', 'Output file path (.png or .jpg) — overrides default captures/ folder')
  .option('--scale <number>', 'Upscaling factor (e.g. 2, 3)', '2')
  .option('--trim-nav', 'Force nav bar removal (auto-enabled for browsers)')
  .option('--no-trim-nav', 'Disable automatic nav bar removal')
  .option('--list', 'List all visible windows');

program.parse(process.argv);

const opts = program.opts();

(async () => {
  if (opts.list) {
    const windows = listWindows();
    if (windows.length === 0) {
      console.log('No visible windows found.');
    } else {
      console.log(`\nAvailable windows (${windows.length}):\n`);
      windows.forEach((w) => {
        console.log(`  [${w.process}]  ${w.title}`);
      });
    }
    process.exit(0);
  }

  if (!opts.app) {
    console.error('Error: --app <name> is required. Use --list to see available windows.');
    process.exit(1);
  }

  const scale = parseFloat(opts.scale);
  if (isNaN(scale) || scale <= 0) {
    console.error('Error: --scale must be a positive number.');
    process.exit(1);
  }

  let output;
  if (opts.output) {
    output = path.resolve(opts.output);
  } else {
    const capturesDir = path.resolve(process.cwd(), 'captures');
    if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    output = path.join(capturesDir, `${opts.app}-${timestamp}.png`);
  }

  console.log(`\nSearching for window: "${opts.app}"...`);

  try {
    const trimNav = opts.trimNav === true ? true : opts.trimNav === false ? false : null;
    const result = await capture({ app: opts.app, scale, output, trimNav });

    console.log(`\nWindow found: "${result.window.title}" [${result.window.process}]`);
    if (result.trimmedPx > 0) {
      console.log(`Nav bar trimmed     : ${result.trimmedPx}px`);
    }
    console.log(`Original resolution : ${result.originalWidth} x ${result.originalHeight}`);
    console.log(`Final resolution    : ${result.finalWidth} x ${result.finalHeight}  (x${scale})`);
    console.log(`Saved to            : ${result.output}\n`);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    process.exit(1);
  }
})();
