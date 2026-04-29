const { capture, listWindows } = require('../src/index');

(async () => {
  console.log('Available windows:');
  listWindows().forEach((w) => console.log(`  [${w.process}]  ${w.title}`));

  console.log('\nCapturing Firefox at 2x...');
  const result = await capture({
    app: 'firefox',
    scale: 2,
    output: './captures/firefox-example.png',
  });

  console.log(`Saved: ${result.output}`);
  console.log(`Resolution: ${result.originalWidth}x${result.originalHeight} -> ${result.finalWidth}x${result.finalHeight}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
