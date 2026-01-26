/**
 * Common fonts used in thermal printers
 */
export type Font = 'FontA' | 'FontB' | 'FontC' | 'FontD' | 'FontE';

/**
 * Get the byte representation of a font
 */
export function fontToBytes(font: Font): Uint8Array {
  const map: Record<Font, number> = {
    FontA: 0x00,
    FontB: 0x01,
    FontC: 0x02,
    FontD: 0x03,
    FontE: 0x04,
  };
  return new Uint8Array([map[font]]);
}
