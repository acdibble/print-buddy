import { Printer, getUsbProfile, Receipt, text, bold, underline } from './src';

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
      .line(text('================================'))
      .line(text('        TEST RECEIPT'))
      .line(text('================================'))
      .blank()
      .line(bold(text('Bold Text Test')))
      .line(text('Normal text'))
      .blank()
      .table(
        ['Item', 'Price'],
        [
          ['Coffee', '$3.50'],
          ['Muffin', '$2.75'],
          ['Total', '$6.25'],
        ]
      )
      .blank()
      .line(text('Thank you for testing!'))
      .blank()
      .cut();

    await printer.print(receipt);

    console.log('Print job sent successfully!');
  } finally {
    await printer.close();
  }
}

main().catch(console.error);
