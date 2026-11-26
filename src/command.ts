/** Print and feed paper (ESC d) - feeds 4 lines */
export const FEED = new Uint8Array([0x1b, 0x64, 0x04]);

/** Full paper cut (GS V A) */
export const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x96]);

/** Partial paper cut (GS V B) */
export const PARTIAL_CUT = new Uint8Array([0x1d, 0x56, 0x42, 0x96]);

/** Reset the printer (ESC @) */
export const RESET = new Uint8Array([0x1b, 0x40]);

/** Set print mode to default (ESC ! 0) */
export const PRINT_MODE_DEFAULT = new Uint8Array([0x1b, 0x21, 0x00]);

/** Turn bold on (ESC E 1) */
export const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);

/** Turn bold off (ESC E 0) */
export const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);

/** Turn underline off (ESC - 0) */
export const UNDERLINE_OFF = new Uint8Array([0x1b, 0x2d, 0x00]);

/** 1-dot underline (ESC - 1) */
export const UNDERLINE_1DOT = new Uint8Array([0x1b, 0x2d, 0x01]);

/** 2-dot underline (ESC - 2) */
export const UNDERLINE_2DOT = new Uint8Array([0x1b, 0x2d, 0x02]);

const DLE = 0x10;
/** Second bytes of the real-time commands: DLE EOT, DLE ENQ, DLE DC4 */
const REAL_TIME_FUNCTIONS = new Set([0x04, 0x05, 0x14]);

/**
 * Print a raster bit image at normal size (GS v 0 m xL xH yL yH d1...dk)
 *
 * The printer acts on real-time commands (DLE EOT, DLE ENQ, DLE DC4) as soon
 * as it receives them, even inside image data, so `10 04`, `10 05` and
 * `10 14` in the data would send status, recover from errors, pulse the
 * drawer or clear the buffer. Each such `10` is sent as `00` instead, which
 * drops one black dot.
 *
 * @param bytesPerRow Width in bytes (8 dots each)
 * @param rows Height in dots
 * @param data Packed rows, `bytesPerRow × rows` bytes, MSB = leftmost dot
 */
export function rasterImage(bytesPerRow: number, rows: number, data: Uint8Array): Uint8Array {
  const command = new Uint8Array(8 + data.length);
  command.set([
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    bytesPerRow >> 8,
    rows & 0xff,
    rows >> 8,
  ]);
  command.set(data, 8);
  for (let i = 8; i < command.length - 1; i++) {
    if (command[i] === DLE && REAL_TIME_FUNCTIONS.has(command[i + 1])) command[i] = 0x00;
  }
  return command;
}

/** Left justify (ESC a 0) */
export const ALIGN_LEFT = new Uint8Array([0x1b, 0x61, 0x00]);

/** Center justify (ESC a 1) */
export const ALIGN_CENTER = new Uint8Array([0x1b, 0x61, 0x01]);

/** Right justify (ESC a 2) */
export const ALIGN_RIGHT = new Uint8Array([0x1b, 0x61, 0x02]);

/** Select Font A (ESC M 0) */
export const FONT_A = new Uint8Array([0x1b, 0x4d, 0x00]);

/** Select Font B (ESC M 1) */
export const FONT_B = new Uint8Array([0x1b, 0x4d, 0x01]);

/** Turn upside-down mode on (ESC { 1) */
export const FLIP_ON = new Uint8Array([0x1b, 0x7b, 0x01]);

/** Turn upside-down mode off (ESC { 0) */
export const FLIP_OFF = new Uint8Array([0x1b, 0x7b, 0x00]);

/** Transmit the offline cause status in real time (DLE EOT 2) */
export const OFFLINE_CAUSE_REQUEST = new Uint8Array([0x10, 0x04, 0x02]);

/**
 * Request a process ID response (GS ( H fn=48). The printer replies
 * `37 22 <id> 00` once everything sent before it has printed.
 *
 * @param id 4 ASCII digits
 */
export function processIdRequest(id: string): Uint8Array {
  return new Uint8Array([0x1d, 0x28, 0x48, 0x06, 0x00, 0x30, 0x30, ...Buffer.from(id, 'ascii')]);
}
