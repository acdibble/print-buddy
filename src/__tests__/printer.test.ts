import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleConnection } from '../connections/console-connection.js';
import { EscposError } from '../errors.js';
import { createConsoleProfile } from '../printer-profile.js';
import { Printer } from '../printer.js';
import { Receipt } from '../receipt.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Spy on the console connection, with printing turned into a no-op */
function spyOnConnection() {
  return {
    open: vi.spyOn(ConsoleConnection.prototype, 'open'),
    close: vi.spyOn(ConsoleConnection.prototype, 'close'),
    print: vi.spyOn(ConsoleConnection.prototype, 'print').mockResolvedValue(undefined),
  };
}

const receipt = (text: string) => new Receipt().line(text);

describe('Printer', () => {
  it("doesn't open the connection until a job prints", async () => {
    const { open, close } = spyOnConnection();

    {
      await using printer = await Printer.create(createConsoleProfile());
      expect(printer).toBeInstanceOf(Printer);
    }

    expect(open).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('opens the connection for a job and closes it when the queue is empty', async () => {
    const { open, close, print } = spyOnConnection();
    const printer = await Printer.create(createConsoleProfile());

    await printer.print(receipt('one'));
    expect(open).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(print.mock.invocationCallOrder[0]);
    expect(print.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);

    await printer.print(receipt('two'));
    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('keeps the connection open while jobs are queued', async () => {
    const { open, close, print } = spyOnConnection();
    const printer = await Printer.create(createConsoleProfile());

    await Promise.all([
      printer.print(receipt('one')),
      printer.print(receipt('two')),
      printer.print(receipt('three')),
    ]);

    expect(print).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the connection open for a job queued while one prints', async () => {
    const { open, close, print } = spyOnConnection();
    const printer = await Printer.create(createConsoleProfile());
    let second: Promise<void> | undefined;
    print.mockImplementationOnce(async () => {
      second = printer.print(receipt('two'));
    });

    await printer.print(receipt('one'));
    await second;

    expect(print).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('prints jobs one at a time, in order', async () => {
    const { print } = spyOnConnection();
    const printer = await Printer.create(createConsoleProfile());
    const events: string[] = [];
    print.mockImplementation(async (r) => {
      const text = JSON.stringify(r.nodes());
      events.push(`start ${text}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end ${text}`);
    });

    await Promise.all([printer.print(receipt('a')), printer.print(receipt('b'))]);

    const a = JSON.stringify(receipt('a').nodes());
    const b = JSON.stringify(receipt('b').nodes());
    expect(events).toEqual([`start ${a}`, `end ${a}`, `start ${b}`, `end ${b}`]);
  });

  it('closes the connection after a failed job and opens it again for the next', async () => {
    const { open, close, print } = spyOnConnection();
    print.mockRejectedValueOnce(new Error('jammed'));
    const printer = await Printer.create(createConsoleProfile());

    const results = await Promise.allSettled([
      printer.print(receipt('one')),
      printer.print(receipt('two')),
    ]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('rejects the job and keeps going when the connection fails to open', async () => {
    const { open, close } = spyOnConnection();
    open.mockRejectedValueOnce(new Error('offline'));
    const printer = await Printer.create(createConsoleProfile());

    await expect(printer.print(receipt('one'))).rejects.toThrow('offline');
    expect(close).not.toHaveBeenCalled();

    await printer.print(receipt('two'));
    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it("doesn't fail a job that printed when closing the connection fails", async () => {
    const { close } = spyOnConnection();
    close.mockRejectedValueOnce(new Error('stuck'));
    const printer = await Printer.create(createConsoleProfile());

    await expect(printer.print(receipt('one'))).resolves.toBeUndefined();
  });

  it('closes the connection when printing throws in an await using block', async () => {
    const { close, print } = spyOnConnection();
    print.mockRejectedValue(new Error('jammed'));

    const run = async () => {
      await using printer = await Printer.create(createConsoleProfile());
      await printer.print(receipt('Hello'));
    };

    await expect(run()).rejects.toThrow('jammed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits for queued jobs on close', async () => {
    const { close, print } = spyOnConnection();
    const printer = await Printer.create(createConsoleProfile());

    const jobs = [printer.print(receipt('one')), printer.print(receipt('two'))];
    await printer.close();

    expect(print).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    await Promise.all(jobs);
  });

  it('rejects jobs after it was closed', async () => {
    const { open } = spyOnConnection();
    const printer = await Printer.create(createConsoleProfile());

    await printer.close();
    await printer.close();

    await expect(printer.print(receipt('late'))).rejects.toThrow(EscposError);
    await expect(printer.print(receipt('late'))).rejects.toThrow('Printer is closed');
    expect(open).not.toHaveBeenCalled();
  });
});
