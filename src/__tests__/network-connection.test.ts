import { createServer, Server, Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NetworkConnection } from '../connections/network-connection.js';
import { UsbConnection } from '../connections/usb-connection.js';
import { NetworkError } from '../errors.js';
import { createNetworkProfile } from '../printer-profile.js';
import { Printer } from '../printer.js';
import { bold, Receipt, underline } from '../receipt.js';
import { writtenBytes } from './helpers/usb-mock.js';
import { VirtualPrinter } from './helpers/virtual-printer.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

interface FakePrinter {
  port: number;
  /** Bytes received on each connection, in the order the connections ended */
  jobs: Buffer[];
  /** Resolves once `count` connections have ended */
  waitForJobs(count: number): Promise<Buffer[]>;
}

const servers: Server[] = [];
const sockets: Socket[] = [];

/**
 * A TCP server that acts like a network printer on a random local port.
 * With `holdOpen`, it never closes its side of the connection.
 */
async function startFakePrinter({ holdOpen = false } = {}): Promise<FakePrinter> {
  const jobs: Buffer[] = [];
  const waiters: (() => void)[] = [];

  const server = createServer((socket: Socket) => {
    sockets.push(socket);
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', () => {
      jobs.push(Buffer.concat(chunks));
      for (const wake of waiters) wake();
      if (!holdOpen) socket.end();
    });
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  return {
    port: address.port,
    jobs,
    waitForJobs: (count) =>
      new Promise((resolve) => {
        const check = () => {
          if (jobs.length >= count) resolve(jobs);
        };
        waiters.push(check);
        check();
      }),
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

    await conn.print(new Receipt().line(bold('Hello')).line('World', { align: 'right' }).cut());
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
    const usb = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    await usb!.print(receipt);

    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);
    await conn.print(receipt);
    const [job] = await printer.waitForJobs(1);

    expect([...job]).toEqual(writtenBytes);
  });

  it('opens a new connection for every job', async () => {
    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await conn.print(new Receipt().line('one'));
    await conn.print(new Receipt().line('two'));
    const jobs = await printer.waitForJobs(2);

    expect(jobs.map((job) => render(job).split('\n')[1])).toEqual([
      `│one${' '.repeat(29)}│`,
      `│two${' '.repeat(29)}│`,
    ]);
  });

  it('sends concurrent jobs one at a time without mixing them', async () => {
    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    await Promise.all([
      conn.print(new Receipt().line(bold('first')).line('a')),
      conn.print(new Receipt().line(underline('second')).line('b')),
    ]);
    const jobs = await printer.waitForJobs(2);

    expect(jobs.map((job) => render(job))).toMatchInlineSnapshot(`
      [
        "┌────────────────────────────────┐
      │first                           │ bold
      │a                               │
      └────────────────────────────────┘ (no cut)",
        "┌────────────────────────────────┐
      │second                          │ underline
      │b                               │
      └────────────────────────────────┘ (no cut)",
      ]
    `);
  });

  it('rejects with a NetworkError when nothing is listening', async () => {
    const port = await closedPort();
    const conn = new NetworkConnection('127.0.0.1', port, 1000, 32);

    const error = await conn.print(new Receipt().line('Hello')).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toMatch(/^Network error: Failed to print to 127\.0\.0\.1:\d+/);
  });

  it('keeps printing after a failed job', async () => {
    const port = await closedPort();
    const failing = new NetworkConnection('127.0.0.1', port, 1000, 32);
    await expect(failing.print(new Receipt().line('x'))).rejects.toThrow(NetworkError);
    await expect(failing.print(new Receipt().line('y'))).rejects.toThrow(NetworkError);
  });

  it('finishes a sent job when the printer never closes the connection', async () => {
    const printer = await startFakePrinter({ holdOpen: true });
    const conn = new NetworkConnection('127.0.0.1', printer.port, 50, 32);

    await conn.print(new Receipt().line('Hello'));

    expect(printer.jobs).toHaveLength(1);
  });

  it('waits for queued jobs on close', async () => {
    const printer = await startFakePrinter();
    const conn = new NetworkConnection('127.0.0.1', printer.port, 1000, 32);

    void conn.print(new Receipt().line('one'));
    void conn.print(new Receipt().line('two'));
    await conn.close();

    expect(printer.jobs).toHaveLength(2);
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

    await printer!.print(new Receipt().line('Hi', { align: 'center' }));
    await printer!.close();
    const [job] = await fake.waitForJobs(1);

    expect(render(job, 48).split('\n')[1]).toBe(`│${' '.repeat(23)}Hi${' '.repeat(23)}│`);
  });

  it('defaults to port 9100', () => {
    expect(
      createNetworkProfile({ host: 'pi.local', columnsPerFont: { FontA: 48, FontB: 64 } })
        .connectionData,
    ).toEqual({ type: 'network', host: 'pi.local', port: 9100, timeout: 5000 });
  });
});
