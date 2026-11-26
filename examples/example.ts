import { bold, createConsoleProfile, Printer, Receipt, underline } from '../src/index.js';

async function main() {
  // Test with console output (no hardware needed)
  const profile = createConsoleProfile();
  await using printer = await Printer.create(profile);

  console.log('=== Console Printer Test ===\n');

  const receipt = new Receipt()
    .line('Hello World!')
    .line('This is a test receipt.')
    .blank()
    .line(bold('Bold text'))
    .line(underline('Underlined text'))
    .blank()
    .table({
      header: ['Product', 'Price'],
      rows: [
        ['Milk', '5.00'],
        ['Cereal', '10.00'],
        ['Bread', '3.50'],
      ],
    })
    .blank()
    .line('Thank you!')
    .cut();

  await printer.print(receipt);

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
