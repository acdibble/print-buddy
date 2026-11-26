import { createServer, Server, Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NetworkConnection } from '../connections/network-connection.js';
import { UsbConnection } from '../connections/usb-connection.js';
import { NetworkError, UnconfirmedPrintError } from '../errors.js';
import { createNetworkProfile } from '../printer-profile.js';
import { Printer } from '../printer.js';
import { bold, Receipt, underline } from '../receipt.js';
import { writtenBytes } from './helpers/usb-mock.js';
import { VirtualPrinter } from './helpers/virtual-printer.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

interface FakePrinter {
  port: number;
  /** Bytes received on each connection, in the order the connections closed */
  jobs: Buffer[];
  /** Resolves once `count` connections have closed */
  waitForJobs(count: number): Promise<Buffer[]>;
  /** Resolves once `count` bytes have arrived, over all connections */
  waitForBytes(count: number): Promise<void>;
  /** Drop every open connection, like a printer that was switched off */
  dropConnections(): void;
}

const servers: Server[] = [];
const sockets: Socket[] = [];

/**
 * A TCP server that acts like a network printer, on a random local port
 * unless `port` is given. With `holdOpen`, it never closes its side of the
 * connection. It echoes process ID requests after `confirmDelay` ms unless
 * `confirm` is false, and answers DLE EOT 2 with `offlineCause`.
 */
async function startFakePrinter({
  holdOpen = false,
  port = 0,
  confirm = true,
  confirmDelay = 0,
  offlineCause = 0x12,
} = {}): Promise<FakePrinter> {
  const jobs: Buffer[] = [];
  const waiters: (() => void)[] = [];
  const open: Socket[] = [];
  let received = 0;
  const wakeAll = () => {
    for (const wake of waiters) wake();
  };
  const waitUntil = (done: () => boolean) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (done()) resolve();
      };
      waiters.push(check);
      check();
    });

  const server = createServer((socket: Socket) => {
    sockets.push(socket);
    open.push(socket);
    const chunks: Buffer[] = [];
    let scanned = 0;
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      received += chunk.length;
      const all = Buffer.concat(chunks);
      const reply = (bytes: number[], delay = 0) => {
        setTimeout(() => {
          if (!socket.destroyed) socket.write(Buffer.from(bytes));
        }, delay);
      };
      for (; scanned + 2 < all.length; scanned++) {
        const i = scanned;
        if (all[i] === 0x10 && all[i + 1] === 0x04 && all[i + 2] === 0x02) reply([offlineCause]);
        if (all[i] === 0x1d && all[i + 1] === 0x28 && all[i + 2] === 0x48) {
          if (i + 11 > all.length) break;
          if (confirm) reply([0x37, 0x22, ...all.subarray(i + 7, i + 11), 0x00], confirmDelay);
        }
      }
      wakeAll();
    });
    socket.on('error', () => {});
    socket.on('end', () => {
      if (!holdOpen) socket.end();
    });
    socket.on('close', () => {
      jobs.push(Buffer.concat(chunks));
      wakeAll();
    });
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  return {
    port: address.port,
    jobs,
    waitForJobs: async (count) => {
      await waitUntil(() => jobs.length >= count);
      return jobs;
    },
    waitForBytes: (count) => waitUntil(() => received >= count),
    dropConnections: () => {
      for (const socket of open.splice(0)) socket.destroy();
    },
  };
}

/** A port with nothing listening on it */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

const render = (bytes: Buffer, columns = 32) => new VirtualPrinter(columns).write(bytes).render();

/** The text of each printed line, without the paper border or style tags */
const lines = (bytes: Buffer) =>
  render(bytes)
    .split('\n')
    .slice(1, -1)
    .map((line) => line.slice(1, line.lastIndexOf('│')).trim());

const networkProfile = (port: number, timeout?: number, printTimeout?: number) =>
  createNetworkProfile({
    host: '127.0.0.1',
    port,
    timeout,
    printTimeout,
    columnsPerFont: { FontA: 32, FontB: 42 },
  });

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

describe('NetworkConnection', () => {
  it('sends a print job over TCP', async () => {
    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await conn.open();
    await conn.print(new Receipt().line(bold('Hello')).line('World', { align: 'right' }).cut());
    await conn.close();
    const [job] = await printer.waitForJobs(1);

    expect(render(job)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │Hello                           │ bold
      │                           World│
      └────────────────────────────────┘ ✂ cut"
    `);
  });

  it('sends the same bytes as the USB connection', async () => {
    const receipt = new Receipt()
      .line(bold(['Total: ', underline('$5', 'thick')]), { align: 'center' })
      .pair('Item', '$1.00')
      .rule()
      .blank(2)
      .feed()
      .partialCut();

    writtenBytes.length = 0;
    const usb = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await usb.open();
    await usb.print(receipt);

    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);
    await conn.open();
    await conn.print(receipt);
    await conn.close();
    const [job] = await printer.waitForJobs(1);

    expect([...job]).toEqual(writtenBytes);
  });

  it('sends every job on one socket until it is closed', async () => {
    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await conn.open();
    await conn.print(new Receipt().line('one'));
    await conn.print(new Receipt().line('two'));
    await conn.close();
    const jobs = await printer.waitForJobs(1);

    expect(jobs.map(lines)).toEqual([['one', 'two']]);
  });

  it('connects again when the printer dropped the socket', async () => {
    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await conn.open();
    await conn.print(new Receipt().line('one'));
    // The client can finish before the server has accepted the connection
    await printer.waitForBytes(1);
    printer.dropConnections();
    await printer.waitForJobs(1);
    // Let the client see the socket close
    await new Promise((resolve) => setTimeout(resolve, 20));

    await conn.print(new Receipt().line('two'));
    await conn.close();
    const jobs = await printer.waitForJobs(2);

    expect(jobs.map(lines)).toEqual([['one'], ['two']]);
  });

  it('rejects with a NetworkError when nothing is listening', async () => {
    const port = await closedPort();
    const conn = new NetworkConnection('127.0.0.1', port, 1000, 32);

    const error = await conn.open().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toMatch(
      /^Network error: Failed to connect to 127\.0\.0\.1:\d+/,
    );
  });

  it('closes when the printer never closes its side', async () => {
    const printer = await startFakePrinter({ holdOpen: true });
    const conn = new NetworkConnection('127.0.0.1', printer.port, 50, 32);

    await conn.open();
    await conn.print(new Receipt().line('Hello'));
    await conn.close();
    const [job] = await printer.waitForJobs(1);

    expect(lines(job)).toEqual(['Hello']);
  });

  it('does nothing when closed without being opened', async () => {
    await expect(new NetworkConnection('127.0.0.1', 9100).close()).resolves.toBeUndefined();
  });

  it('waits for the printer to confirm the job', async () => {
    const printer = await startFakePrinter({ confirmDelay: 100 });
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await conn.open();
    const started = performance.now();
    await conn.print(new Receipt().line('Hello'));
    await conn.close();

    expect(performance.now() - started).toBeGreaterThanOrEqual(90);
  });

  it('keeps waiting for a confirmation past the idle timeout', async () => {
    const printer = await startFakePrinter({ confirmDelay: 200 });
    const conn = new NetworkConnection('127.0.0.1', printer.port, 50, 32, 1000);

    await conn.open();
    await expect(conn.print(new Receipt().line('Hello'))).resolves.toBeUndefined();
    await conn.close();
  });

  it('reports why the printer did not confirm the job', async () => {
    const printer = await startFakePrinter({ confirm: false, offlineCause: 0x16 });
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32, 50);

    await conn.open();
    const error = await conn.print(new Receipt().line('Hello')).catch((err: unknown) => err);
    await conn.close();

    expect(error).toBeInstanceOf(UnconfirmedPrintError);
    expect(error).toMatchObject({
      message: expect.stringContaining('within 50ms (cover open)') as unknown,
      status: { coverOpen: true, paperEnd: false, error: false },
    });
  });

  it('rejects when the printer drops the connection before confirming', async () => {
    const printer = await startFakePrinter({ confirm: false });
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await conn.open();
    const job = conn.print(new Receipt().line('Hello')).catch((err: unknown) => err);
    await printer.waitForBytes(1);
    printer.dropConnections();
    const error = await job;

    expect(error).toBeInstanceOf(UnconfirmedPrintError);
    expect((error as Error).cause).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toMatch(/connection dropped before the printer confirmed/);
  });
});

describe('Printer with a network profile', () => {
  it('prints to the host and port from the profile', async () => {
    const fake = await startFakePrinter();
    const printer = await Printer.create(
      createNetworkProfile({
        host: '127.0.0.1',
        port: fake.port,
        columnsPerFont: { FontA: 48, FontB: 64 },
      }),
    );

    await printer.print(new Receipt().line('Hi', { align: 'center' }));
    await printer.close();
    const [job] = await fake.waitForJobs(1);

    expect(render(job, 48).split('\n')[1]).toBe(`│${' '.repeat(23)}Hi${' '.repeat(23)}│`);
  });

  it('sends queued jobs one at a time on one connection', async () => {
    const fake = await startFakePrinter();
    const printer = await Printer.create(networkProfile(fake.port));

    await Promise.all([
      printer.print(new Receipt().line(bold('first')).line('a')),
      printer.print(new Receipt().line(underline('second')).line('b')),
    ]);
    const jobs = await fake.waitForJobs(1);

    expect(jobs.map((job) => render(job))).toMatchInlineSnapshot(`
      [
        "┌────────────────────────────────┐
      │first                           │ bold
      │a                               │
      │second                          │ underline
      │b                               │
      └────────────────────────────────┘ (no cut)",
      ]
    `);
  });

  it('connects again for the next batch of jobs', async () => {
    const fake = await startFakePrinter();
    const printer = await Printer.create(networkProfile(fake.port));

    await printer.print(new Receipt().line('one'));
    await fake.waitForJobs(1);
    await printer.print(new Receipt().line('two'));
    const jobs = await fake.waitForJobs(2);

    expect(jobs.map(lines)).toEqual([['one'], ['two']]);
  });

  it('keeps printing after a failed job', async () => {
    const port = await closedPort();
    const printer = await Printer.create(networkProfile(port));

    await expect(printer.print(new Receipt().line('x'))).rejects.toThrow(NetworkError);

    const fake = await startFakePrinter({ port });
    await printer.print(new Receipt().line('y'));
    const jobs = await fake.waitForJobs(1);

    expect(jobs.map(lines)).toEqual([['y']]);
  });

  it('finishes a job when the printer never closes the connection', async () => {
    const fake = await startFakePrinter({ holdOpen: true });
    const printer = await Printer.create(networkProfile(fake.port, 50));

    await printer.print(new Receipt().line('Hello'));
    const jobs = await fake.waitForJobs(1);

    expect(jobs.map(lines)).toEqual([['Hello']]);
  });

  it('waits for queued jobs on close', async () => {
    const fake = await startFakePrinter();
    const printer = await Printer.create(networkProfile(fake.port));

    const jobs = [
      printer.print(new Receipt().line('one')),
      printer.print(new Receipt().line('two')),
    ];
    await printer.close();

    await expect(Promise.all(jobs)).resolves.toEqual([undefined, undefined]);
    expect((await fake.waitForJobs(1)).map(lines)).toEqual([['one', 'two']]);
  });

  it('defaults to port 9100', () => {
    expect(
      createNetworkProfile({ host: 'pi.local', columnsPerFont: { FontA: 48, FontB: 64 } })
        .connectionData,
    ).toEqual({
      type: 'network',
      host: 'pi.local',
      port: 9100,
      timeout: 5000,
      printTimeout: 60_000,
    });
  });
});
