import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleConnection } from '../connections/console-connection.js';
import { createConsoleProfile } from '../printer-profile.js';
import { Printer } from '../printer.js';
import { Receipt } from '../receipt.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Printer', () => {
  it('closes the connection at the end of an await using block', async () => {
    const close = vi.spyOn(ConsoleConnection.prototype, 'close');

    {
      await using printer = await Printer.create(createConsoleProfile());
      expect(printer).toBeInstanceOf(Printer);
      expect(close).not.toHaveBeenCalled();
    }

    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the connection when printing throws', async () => {
    const close = vi.spyOn(ConsoleConnection.prototype, 'close');
    vi.spyOn(ConsoleConnection.prototype, 'print').mockRejectedValue(new Error('jammed'));

    const run = async () => {
      await using printer = await Printer.create(createConsoleProfile());
      await printer.print(new Receipt().line('Hello'));
    };

    await expect(run()).rejects.toThrow('jammed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('only closes the connection once', async () => {
    const close = vi.spyOn(ConsoleConnection.prototype, 'close');

    {
      await using printer = await Printer.create(createConsoleProfile());
      await printer.close();
      await printer.close();
    }

    expect(close).toHaveBeenCalledOnce();
  });
});
