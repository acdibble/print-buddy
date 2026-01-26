import { Printer, createConsoleProfile, Receipt, text, bold, underline } from './src';

async function main() {
  // Test with console output (no hardware needed)
  const profile = createConsoleProfile();
  const printer = await Printer.create(profile);

  if (!printer) {
    console.error('Failed to create printer');
    return;
  }

  console.log('=== Console Printer Test ===\n');

  const receipt = new Receipt()
    .line(text('Hello World!'))
    .line(text('This is a test receipt.'))
    .blank()
    .line(bold(text('Bold text')))
    .line(underline(text('Underlined text')))
    .blank()
    .table(
      ['Product', 'Price'],
      [
        ['Milk', '5.00'],
        ['Cereal', '10.00'],
        ['Bread', '3.50'],
      ]
    )
    .blank()
    .line(text('Thank you!'))
    .cut();

  await printer.print(receipt);
  await printer.close();

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
