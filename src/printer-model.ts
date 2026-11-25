import { createUsbProfile, PrinterProfile } from './printer-profile.js';

const PRINTER_USB_IDS = {
  TMT20III: {
    vendorId: 0x04b8,
    productId: 0x0e28,
    columnWidths: {
      '80mm': {
        FontA: 48,
        FontB: 64,
      },
      '58mm': {
        FontA: 35,
        FontB: 46,
      },
    },
  },
} as const;

export type PrinterModel = keyof typeof PRINTER_USB_IDS;

const PAPER_WIDTH_DOTS = {
  '80mm': 576,
  '58mm': 384,
} as const;

export type PaperWidth = keyof typeof PAPER_WIDTH_DOTS;

/**
 * Get a USB printer profile for a known printer model
 *
 * @param model The printer model
 * @param paperWidth Paper width (default: '80mm')
 */
export function getUsbProfile(
  model: PrinterModel,
  paperWidth: PaperWidth = '80mm',
): PrinterProfile {
  const { vendorId, productId, columnWidths } = PRINTER_USB_IDS[model];

  return createUsbProfile({
    vendorId,
    productId,
    columnsPerFont: columnWidths[paperWidth],
  });
}
