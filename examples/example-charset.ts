import { bold, getUsbProfile, Printer, Receipt } from '../src/index.js';

async function main() {
  const printer = await Printer.create(getUsbProfile('TMT20III'));
  if (!printer) {
    console.error('Printer not found');
    return;
  }

  // CP437 (PC437) character set - default for Epson TM-T20III
  const receipt = new Receipt()
    .line(bold('CP437 CHARACTER SET'), { align: 'center' })
    .line('Epson TM-T20III', { align: 'center' })
    .blank()

    // Basic ASCII (32-126)
    .line(bold('ASCII 32-126'))
    .line(' !"#$%&\'()*+,-./')
    .line('0123456789:;<=>?')
    .line('@ABCDEFGHIJKLMNO')
    .line('PQRSTUVWXYZ[\\]^_')
    .line('`abcdefghijklmno')
    .line('pqrstuvwxyz{|}~')
    .blank()

    // Extended ASCII 128-175 (CP437)
    .line(bold('Extended 128-175'))
    .line('ÇüéâäàåçêëèïîìÄÅ')
    .line('ÉæÆôöòûùÿÖÜ¢£¥₧ƒ')
    .line('áíóúñÑªº¿⌐¬½¼¡«»')
    .blank()

    // Box drawing (176-223)
    .line(bold('Shading & Box Drawing'))
    .line('░▒▓│┤╡╢╖╕╣║╗╝╜╛┐')
    .line('└┴┬├─┼╞╟╚╔╩╦╠═╬╧')
    .line('╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀')
    .blank()

    // Greek & Math (224-254)
    .line(bold('Greek & Math'))
    .line('αßΓπΣσµτΦΘΩδ∞φε∩')
    .line('≡±≥≤⌠⌡÷≈°∙·√ⁿ²■')
    .blank()

    // Box examples
    .line(bold('Single Box'))
    .line('┌──────────────┐')
    .line('│ Single Line  │')
    .line('├──────────────┤')
    .line('│ Box Drawing  │')
    .line('└──────────────┘')
    .blank()

    .line(bold('Double Box'))
    .line('╔══════════════╗')
    .line('║ Double Line  ║')
    .line('╠══════════════╣')
    .line('║ Box Drawing  ║')
    .line('╚══════════════╝')
    .blank()

    // Mixed box
    .line(bold('Mixed Box'))
    .line('╒══════════════╕')
    .line('│ Mixed Style  │')
    .line('╞══════════════╡')
    .line('│ Connectors   │')
    .line('╘══════════════╛')
    .blank()

    // Shading blocks
    .line(bold('Block Elements'))
    .line('░░░░▒▒▒▒▓▓▓▓████')
    .line('▀▀▀▀▄▄▄▄█▌▌▐▐███')
    .blank()

    // Currency & symbols
    .line(bold('Currency & Symbols'))
    .line('¢ £ ¥ ₧ ƒ')
    .line('ª º ¿ ⌐ ¬ ½ ¼ ¡ « »')
    .blank()

    // Sample receipt
    .line(bold('Sample Receipt'))
    .line('════════════════════════════════')
    .line('  Item              Qty   Price')
    .line('────────────────────────────────')
    .line('  Café               2   $ 7.00')
    .line('  Croissant          1   $ 3.50')
    .line('────────────────────────────────')
    .line('  Subtotal              $ 10.50')
    .line('  Tax (8%)              $  0.84')
    .line('════════════════════════════════')
    .line(bold('  TOTAL                 $ 11.34'))
    .line('════════════════════════════════')
    .blank()
    .line('Gracias · Merci · Danke', { align: 'center' })
    .blank()
    .cut();

  await printer.print(receipt);
  await printer.close();

  console.log('Printed charset demo');
}

main().catch(console.error);
