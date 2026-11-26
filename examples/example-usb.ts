import { bold, fontB, getUsbProfile, Printer, Receipt, underline } from '../src/index.js';

async function main() {
  console.log('Attempting to connect to Epson TM-T20III printer...');

  const profile = getUsbProfile('TMT20III');
  const printer = await Printer.create(profile);

  if (!printer) {
    console.error('Printer not found! Make sure it is connected and powered on.');
    return;
  }

  console.log('Connected to printer!');

  try {
    const receipt = new Receipt()
      // Header with styling
      .line(bold('PRINT BUDDY'), { align: 'center' })
      .line('Feature Showcase', { align: 'center' })
      .rule('=')
      .blank()

      // Text styles
      .line(bold('Bold text'))
      .line(underline('Underline (normal)'))
      .line(underline('Underline (thick)', 'thick'))
      .line(bold(underline('Bold + Underline')))
      .blank()

      // Font B (narrower font, more characters per line)
      .line('Font A: Default font')
      .line(fontB('Font B: Narrower font fits more text'))
      .blank()

      // Text alignment
      .line('Left aligned')
      .line('Center aligned', { align: 'center' })
      .line('Right aligned', { align: 'right' })
      .blank()

      // Upside-down text
      .line('Upside-down text', { flip: true })
      .line(bold('Flipped + Bold + Centered'), { align: 'center', flip: true })
      .blank()

      // Mixed styles on one line
      .line(['Plain, ', bold('bold'), ', ', underline('underlined'), ' and ', fontB('Font B')])
      .blank()

      // Table, rule and pairs
      .line(underline('Order Summary'))
      .table({
        header: ['Item', 'Qty', 'Price'],
        rows: [
          ['Espresso', '2', '$8.00'],
          ['Butter croissant with almond filling', '1', '$3.50'],
        ],
      })
      .rule()
      .pair('Tip', '$1.50', { fill: '.' })
      .pair(bold('Total'), bold('$13.00'))
      .blank()

      // Word-wrapped paragraph
      .paragraph(
        'Long text wraps at word boundaries to fit the paper width, instead of breaking mid-word.',
      )
      .blank()

      // Nested styles
      .line(bold(underline('Nested Styles')), { align: 'center' })
      .line(fontB(bold('Font B + Bold')))
      .line(fontB('Flipped + Font B'), { flip: true })
      .blank()

      // Footer
      .line('Thank you for testing!', { align: 'center' })
      .line(fontB('github.com/acdibble/print-buddy'), { align: 'center' })
      .blank(2)
      .partialCut();

    await printer.print(receipt);

    console.log('Print job sent successfully!');
  } finally {
    await printer.close();
  }
}

main().catch(console.error);
