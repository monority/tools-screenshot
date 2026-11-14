export interface WindowInfo {
  id: string;
  title: string;
  process: string;
  isBrowser: boolean;
}

export interface CapturedWindow {
  id: string;
  title: string;
  process: string;
  isForeground: boolean;
}

export interface CaptureOptions {
  /** Process or window name. Required unless windowId is provided. */
  app?: string;
  /** Exact window id returned by listWindows(). */
  windowId?: string | number;
  /** Upscaling factor. Defaults to 2. */
  scale?: number;
  /** Target width in pixels. Overrides scale. */
  width?: number;
  /** @deprecated Use width. */
  targetWidth?: number;
  /** Output file path (.png, .jpg, .jpeg or .webp). Defaults to ./capture.png. */
  output?: string;
  /** true = force navbar removal, false = disable, null = auto (browsers only). */
  trimNav?: boolean | null;
}

export interface CaptureResult {
  window: CapturedWindow;
  /** How the pixels were obtained: screen capture or the PrintWindow fallback. */
  source: 'screen' | 'print-window';
  /** Reason the PrintWindow fallback was skipped, or null when it succeeded/was not needed. */
  printWindowWarning: string | null;
  trimmedPx: number;
  navBarDetected: boolean;
  navBarHeight: number;
  navBarMethod: string;
  navBarConfidence: number;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
  output: string;
}

export function capture(options?: CaptureOptions): Promise<CaptureResult>;
export function listWindows(): WindowInfo[];
