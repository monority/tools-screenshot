#!/usr/bin/env node

const { program } = require('commander');
const prompts = require('prompts');
const { capture, listWindows } = require('../src/index');
const pkg = require('../package.json');
const path = require('path');
const fs = require('fs');

program.name('screenshot-win').description('Capture a specific desktop window in high resolution').version(pkg.version);

program
  .option('--app <name>', 'Process or window name to capture (e.g. firefox, Code)')
  .option('--id <id>', 'Capture a specific window id (see --list)')
  .option('--output <path>', 'Output file path (.png, .jpg or .webp) — overrides default captures/ folder')
  .option('--scale <number>', 'Upscaling factor (e.g. 2, 3)', '2')
  .option('--width <number>', 'Target width in pixels (overrides scale)')
  .option('--trim-nav', 'Force nav bar removal (auto-enabled for browsers)')
  .option('--no-trim-nav', 'Disable automatic nav bar removal')
  .option('--list', 'List all visible windows');

program.parse(process.argv);
const opts = program.opts();

const fail = (message) => {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
};

const parsePositiveNumber = (value, label) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    fail(`${label} must be a positive number.`);
  }
  return num;
};

// Process/title names are used as filenames and may contain characters that are
// illegal on Windows or traverse directories.
const sanitizeFileName = (name) => {
  const cleaned = String(name)
    // Control characters are illegal in Windows filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned.slice(0, 80) || 'capture';
};

const buildOutputPath = (appName, format = 'png') => {
  const capturesDir = path.resolve(process.cwd(), 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(capturesDir, `${sanitizeFileName(appName)}-${timestamp}.${format}`);
};

const loadWindows = () => {
  try {
    return listWindows();
  } catch (err) {
    fail(err.message);
  }
};

const printWindows = (windows) => {
  if (windows.length === 0) {
    console.log('No visible windows found.');
    return;
  }
  console.log(`\nAvailable windows (${windows.length}):\n`);
  windows.forEach((w) => console.log(`  [${w.process}]  ${w.title}  (id: ${w.id})`));
};

const runCapture = async ({ app, windowId, scale, output, trimNav, targetWidth }) => {
  console.log(`\nSearching for window: "${app || `id ${windowId}`}"...`);

  try {
    const result = await capture({ app, windowId, scale, output, trimNav, targetWidth });

    console.log(`\nWindow found: "${result.window.title}" [${result.window.process}]`);
    if (result.source === 'print-window') {
      console.log('Capture source      : PrintWindow (background window)');
    } else if (result.window.isForeground === false) {
      console.log('Warning: window is not in the foreground — the capture may contain overlapping windows.');
      if (result.printWindowWarning) {
        console.log(`Fallback reason     : ${result.printWindowWarning}`);
      }
    }
    if (result.trimmedPx > 0) {
      console.log(`Nav bar trimmed     : ${result.trimmedPx}px (${result.navBarMethod})`);
    }
    console.log(`Original resolution : ${result.originalWidth} x ${result.originalHeight}`);
    console.log(`Final resolution    : ${result.finalWidth} x ${result.finalHeight}`);
    console.log(`Saved to            : ${result.output}\n`);
  } catch (err) {
    fail(err.message);
  }
};

const main = async () => {
  if (opts.list) {
    printWindows(loadWindows());
    return;
  }

  if (opts.app || opts.id) {
    const scale = parsePositiveNumber(opts.scale, '--scale');
    const targetWidth = opts.width ? parsePositiveNumber(opts.width, '--width') : null;
    const output = opts.output ? path.resolve(opts.output) : buildOutputPath(opts.app || 'window');
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(output).toLowerCase())) {
      fail('--output must end with .png, .jpg, .jpeg or .webp.');
    }
    const trimNav = opts.trimNav === true ? true : opts.trimNav === false ? false : null;
    await runCapture({ app: opts.app, windowId: opts.id, scale, output, trimNav, targetWidth });
    process.exit(0);
  }

  const windows = loadWindows();
  const windowChoices = windows.map((w) => ({
    title: `${w.process} — ${w.title}`,
    value: { id: w.id, process: w.process },
  }));

  const response = await prompts(
    [
      {
        type: 'select',
        name: 'app',
        message: 'Select a window to capture',
        choices: [
          ...windowChoices,
          ...(windowChoices.length > 0 ? [{ title: '---', disabled: true }] : []),
          { title: 'List windows only', value: null },
        ],
        initial: 0,
      },
      {
        type: 'number',
        name: 'scale',
        message: 'Upscaling factor (used unless a target resolution is selected)',
        initial: 2,
        min: 1,
      },
      {
        type: 'select',
        name: 'resolution',
        message: 'Resolution',
        choices: [
          { title: 'Use upscaling factor only', value: 'scale' },
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
    ],
    {
      // prompts returns a partial response on Ctrl+C; exit cleanly instead of
      // trying to capture with missing fields.
      onCancel: () => process.exit(0),
    },
  );

  if (!response.app) {
    printWindows(windows);
    return;
  }

  const selected = response.app;
  const output = buildOutputPath(selected.process, response.format);
  const targetWidth = response.resolution === 'scale' ? null : response.resolution;
  await runCapture({
    app: selected.process,
    windowId: selected.id,
    scale: response.scale,
    output,
    trimNav: null,
    targetWidth,
  });
  process.exit(0);
};

main().catch((err) => fail(err.message));
