#!/usr/bin/env node

const { program } = require('commander');
const prompts = require('prompts');
const { capture, listWindows } = require('../src/index');
const path = require('path');
const fs = require('fs');

program
  .name('screenshot-win')
  .description('Capture a specific desktop window in high resolution')
  .version('1.0.0');

program
  .option('--app <name>', 'Process or window name to capture (e.g. firefox, Code)')
  .option('--output <path>', 'Output file path (.png or .jpg) — overrides default captures/ folder')
  .option('--scale <number>', 'Upscaling factor (e.g. 2, 3)', '2')
  .option('--width <number>', 'Target width in pixels (overrides scale)')
  .option('--trim-nav', 'Force nav bar removal (auto-enabled for browsers)')
  .option('--no-trim-nav', 'Disable automatic nav bar removal')
  .option('--list', 'List all visible windows');

program.parse(process.argv);
const opts = program.opts();

const runCapture = async (app, scale, output, trimNav, targetWidth) => {
  console.log(`\nSearching for window: "${app}"...`);

  try {
    const result = await capture({ app, scale, output, trimNav, targetWidth });

    console.log(`\nWindow found: "${result.window.title}" [${result.window.process}]`);
    if (result.trimmedPx > 0) {
      console.log(`Nav bar trimmed     : ${result.trimmedPx}px`);
    }
    console.log(`Original resolution : ${result.originalWidth} x ${result.originalHeight}`);
    console.log(`Final resolution    : ${result.finalWidth} x ${result.finalHeight}`);
    console.log(`Saved to            : ${result.output}\n`);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    process.exit(1);
  }
};

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

  const windows = listWindows();

  if (opts.app) {
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

    const trimNav = opts.trimNav === true ? true : opts.trimNav === false ? false : null;
    const targetWidth = opts.width ? parseFloat(opts.width) : null;
    await runCapture(opts.app, scale, output, trimNav, targetWidth);
    process.exit(0);
  }

  const response = await prompts([
    {
      type: 'select',
      name: 'app',
      message: 'Select a window to capture',
      choices: [
        ...windows.map((w) => ({ title: `${w.process} — ${w.title}`, value: w.process })),
        { title: '---', disabled: true },
        { title: 'List windows only', value: null },
      ],
      initial: 0,
    },
    {
      type: 'number',
      name: 'scale',
      message: 'Upscaling factor',
      initial: 2,
      min: 1,
    },
    {
      type: 'select',
      name: 'resolution',
      message: 'Resolution',
      choices: [
        { title: 'Original (no upscale)', value: 'original' },
        { title: '1080p (1920px width)', value: 1920 },
        { title: '1440p (2560px width)', value: 2560 },
        { title: '4K UHD (3840px width)', value: 3840 },
      ],
      initial: 2,
    },
    {
      type: 'select',
      name: 'format',
      message: 'Output format',
      choices: [
        { title: 'PNG', value: 'png' },
        { title: 'JPG', value: 'jpg' },
        { title: 'WebP', value: 'webp' },
      ],
      initial: 0,
    },
  ]);

  if (!response.app) {
    if (windows.length === 0) {
      console.log('No visible windows found.');
    } else {
      console.log('\nAvailable windows:\n');
      windows.forEach((w) => console.log(`  [${w.process}]  ${w.title}`));
    }
    process.exit(0);
  }

  const capturesDir = path.resolve(process.cwd(), 'captures');
  if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.join(capturesDir, `${response.app}-${timestamp}.${response.format}`);

const targetWidth = response.resolution === 'original' ? null : response.resolution;
  await runCapture(response.app, response.scale, output, null, targetWidth);
})();