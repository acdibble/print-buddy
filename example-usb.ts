import { Printer, getUsbProfile, Receipt, bold, underline } from './src';

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
      .line('================================')
      .line('        TEST RECEIPT')
      .line('================================')
      .blank()
      .line(bold('Bold Text Test'))
      .line('Normal text')
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
      .line('Thank you for testing!')
      .blank()
      .cut();

    await printer.print(receipt);

    console.log('Print job sent successfully!');
  } finally {
    await printer.close();
  }
}

main().catch(console.error);
