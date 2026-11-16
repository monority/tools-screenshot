module.exports = {
  BROWSER_PROCESSES: [
    'firefox',
    'chrome',
    'msedge',
    'brave',
    'opera',
    'vivaldi',
    'arc',
    // Firefox forks share the Mozilla window classes
    'zen',
    'librewolf',
    'waterfox',
  ],

  CONTENT_CLASSES: {
    firefox: ['MozillaCompositorWindowClass', 'MozillaWindowClass'],
    zen: ['MozillaCompositorWindowClass', 'MozillaWindowClass'],
    librewolf: ['MozillaCompositorWindowClass', 'MozillaWindowClass'],
    waterfox: ['MozillaCompositorWindowClass', 'MozillaWindowClass'],
    chrome: ['Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1'],
    msedge: ['Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1'],
    brave: ['Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1'],
    opera: ['Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1'],
    vivaldi: ['Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1'],
    arc: ['Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1'],
  },

  NAVBAR: {
    MIN_NAV_HEIGHT: 15,
    MAX_NAV_HEIGHT: 250,
    SAMPLE_STEP: 4,
    LUMINANCE_THRESHOLD: 35,
    SUSTAINED_HIGH_DENSITY: 0.85,
    SUSTAINED_MODERATE_DENSITY: 0.25,
    SUSTAINED_MODERATE_COUNT: 12,
    PRECEDING_WINDOW_SIZE: 20,
    PRECEDING_MAX_AVG: 0.5,
    DENSITY_JUMP_MIN: 0.2,
    DENSITY_JUMP_WINDOW_BEFORE: 3,
    DENSITY_JUMP_WINDOW_AFTER: 4,
    VALIDATE_BAND_RATIO: 10,
    VALIDATE_MIN_CONFIDENCE: 0.2,
    // Chrome-block strategy: browsers whose chrome background reads as fully
    // lit (e.g. Zen's uniform gray) produce one long high-density band from
    // row 0; chrome ends where density drops and stays low.
    CHROME_BLOCK_MIN_ROWS: 30,
    CHROME_BLOCK_DROP_FLOOR: 0.45,
    CHROME_BLOCK_DROP_ROWS: 8,
  },

  CAPTURE: {
    CROSS_VALIDATION_TOLERANCE: 10,
    MIN_CONTENT_HEIGHT: 50,
    MAX_API_NAVBAR_HEIGHT: 200,
    MIN_API_NAVBAR_HEIGHT: 5,
  },

  ENHANCE: {
    DEFAULT_SCALE: 2,
    SHARPEN: { sigma: 0.5, m1: 1.0, m2: 0.2, x1: 2, y2: 8, y3: 16 },
    PNG_COMPRESSION: 4,
    JPEG_QUALITY: 100,
    JPEG_CHROMA_SUBSAMPLING: '4:4:4',
    WEBP_QUALITY: 80,
  },

  FINDER: {
    POWERSHELL_TIMEOUT_MS: 12000,
  },

  PRINT_WINDOW: {
    TIMEOUT_MS: 20000,
    // A PrintWindow fallback that fails often returns a uniformly black bitmap.
    // Reject only dark uniform images: a legitimately blank white window must
    // still be capturable.
    BLANK_LUMINANCE: 8,
    BLANK_SAMPLES: 4000,
  },
};
