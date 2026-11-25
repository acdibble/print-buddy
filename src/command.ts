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

/** Bitmap mode prefix (ESC *) */
export const BITMAP = new Uint8Array([0x1b, 0x2a]);

/** Set line spacing to 0 (ESC 3 0) */
export const LINE_SPACING_0 = new Uint8Array([0x1b, 0x33, 0x00]);

/** Reset line spacing (ESC 2) */
export const LINE_SPACING_RESET = new Uint8Array([0x1b, 0x32]);

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
