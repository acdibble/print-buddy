import {
  bold,
  createConsoleProfile,
  getUsbProfile,
  Printer,
  type RawImage,
  Receipt,
} from '../src/index.js';

// Prints to the console; pass --usb to print on a TM-T20III instead
const useUsb = process.argv.includes('--usb');

/** A ring with a shaded centre, drawn as RGBA pixels */
function logo(size: number): RawImage {
  const data = new Uint8Array(size * size * 4);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      const i = (y * size + x) * 4;
      const shade = d > 0.8 ? 0 : Math.round(d * 255); // black ring, dark-to-light centre
      data.set([shade, shade, shade, d <= 1 ? 255 : 0], i); // transparent outside the circle
    }
  }
  return { width: size, height: size, data };
}

/** A horizontal black-to-white gradient */
function gradient(width: number, height: number): RawImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = Math.round((x / (width - 1)) * 255);
  }
  return { width, height, data };
}

async function main() {
  await using printer = await Printer.create(
    useUsb ? getUsbProfile('TMT20III') : createConsoleProfile(),
  );

  const receipt = new Receipt()
    .line(bold('IMAGES'), { align: 'center' })
    .blank()
    .image(logo(240), { align: 'center' })
    .blank()
    .line('Floyd-Steinberg dithering:')
    .image(gradient(400, 48), { width: 'full' })
    .line('Threshold:')
    .image(gradient(400, 48), { width: 'full', dither: 'threshold' })
    .blank()
    .cut();

  await printer.print(receipt);
}

main().catch(console.error);
