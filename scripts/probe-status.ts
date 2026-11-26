/**
 * Probe what a TM-T20III sends back for ESC/POS status commands.
 *
 *   pnpm tsx scripts/probe-status.ts                          # USB
 *   pnpm tsx scripts/probe-status.ts --host 192.168.1.50      # port 9100
 *   pnpm tsx scripts/probe-status.ts --interactive            # adds cover-open tests
 *
 * Prints about 25 cm of paper. Every byte the printer sends is logged with
 * its arrival time, then decoded. The bit names come from Star's spec of
 * Epson-compatible mode, not Epson's own reference, so check them.
 */
import { EventEmitter, once } from 'node:events';
import { connect } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import * as usb from 'usb';

const VENDOR_ID = 0x04b8;
const PRODUCT_ID = 0x0e28;

const ESC = 0x1b;
const GS = 0x1d;
const DLE = 0x10;
const EOT = 0x04;

const INIT = [ESC, 0x40];
const dleEot = (n: number) => [DLE, EOT, n];
/** GS ( H fn=48: reply 37 22 <id> 00 once everything before it is processed */
const processId = (id: string) => [GS, 0x28, 0x48, 0x06, 0x00, 0x30, 0x30, ...ascii(id)];
const asb = (n: number) => [GS, 0x61, n];
const FEED_AND_CUT = [ESC, 0x64, 0x04, GS, 0x56, 0x42, 0x00];

const ascii = (text: string) => [...Buffer.from(text, 'ascii')];
const hex = (bytes: Iterable<number>) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

interface Transport {
  write(bytes: number[]): Promise<void>;
  close(): Promise<void>;
}

const started = performance.now();
const now = () => performance.now() - started;
const stamp = (ms = now()) => `${ms.toFixed(0).padStart(6)}ms`;

// --- Decoding --------------------------------------------------------------

type Reply =
  | { kind: 'dle-eot'; n: number | undefined; byte: number }
  | { kind: 'asb'; bytes: number[] }
  | { kind: 'process-id'; id: string }
  | { kind: 'block'; bytes: number[] }
  | { kind: 'xon' | 'xoff' }
  | { kind: 'unknown'; byte: number };

const DLE_EOT_BITS: Record<number, Record<number, string>> = {
  1: { 2: 'drawer pin 3 high', 3: 'OFFLINE', 5: 'bit 5', 6: 'bit 6' },
  2: { 2: 'COVER OPEN', 3: 'feed button pressed', 5: 'STOPPED: PAPER END', 6: 'ERROR' },
  3: {
    2: 'mechanical error',
    3: 'AUTOCUTTER ERROR',
    5: 'UNRECOVERABLE ERROR',
    6: 'auto-recoverable error',
  },
  4: {
    2: 'near end (bit 2)',
    3: 'near end (bit 3)',
    5: 'PAPER END (bit 5)',
    6: 'PAPER END (bit 6)',
  },
};

const ASB_BITS: Record<number, string>[] = [
  { 2: 'drawer pin 3 high', 3: 'OFFLINE', 5: 'COVER OPEN', 6: 'feed button pressed' },
  {
    2: 'mechanical error',
    3: 'AUTOCUTTER ERROR',
    5: 'UNRECOVERABLE ERROR',
    6: 'auto-recoverable error',
  },
  { 0: 'near end (bit 0)', 1: 'near end (bit 1)', 2: 'PAPER END (bit 2)', 3: 'PAPER END (bit 3)' },
  {},
];

function bitNames(byte: number, names: Record<number, string>): string {
  const set = Object.entries(names)
    .filter(([bit]) => byte & (1 << Number(bit)))
    .map(([, name]) => name);
  return set.length > 0 ? set.join(', ') : 'nothing set';
}

function describe(reply: Reply): string {
  switch (reply.kind) {
    case 'dle-eot':
      return reply.n === undefined
        ? `DLE EOT-style byte ${hex([reply.byte])} that nobody asked for`
        : `DLE EOT ${reply.n}: ${bitNames(reply.byte, DLE_EOT_BITS[reply.n] ?? {})}`;
    case 'asb':
      return `ASB ${hex(reply.bytes)}: ${reply.bytes
        .map((b, i) => `[${i + 1}] ${bitNames(b, ASB_BITS[i])}`)
        .join('; ')}`;
    case 'process-id':
      return `GS ( H process ID "${reply.id}"`;
    case 'block':
      return `response block ${hex(reply.bytes)}`;
    case 'xon':
      return 'XON';
    case 'xoff':
      return 'XOFF';
    case 'unknown':
      return `unrecognised byte ${hex([reply.byte])}`;
  }
}

/** Splits the printer's byte stream into replies; DLE EOT replies are matched to requests in order */
class ReplyParser extends EventEmitter<{ reply: [Reply, number] }> {
  private pending: number[] = [];
  readonly requestedDleEot: number[] = [];

  push(bytes: Uint8Array): void {
    console.log(`${stamp()}  ← ${hex(bytes)}`);
    this.pending.push(...bytes);
    let complete = true;
    while (complete && this.pending.length > 0) complete = this.parseOne();
  }

  private parseOne(): boolean {
    const [first] = this.pending;
    let reply: Reply;
    let length = 1;

    if (first === 0x37 || first === 0x3d || first === 0x5f) {
      const end = this.pending.indexOf(0x00);
      if (end === -1) return false;
      length = end + 1;
      const bytes = this.pending.slice(0, length);
      reply =
        first === 0x37 && bytes[1] === 0x22
          ? { kind: 'process-id', id: Buffer.from(bytes.slice(2, -1)).toString('latin1') }
          : { kind: 'block', bytes };
    } else if (first === 0x11) {
      reply = { kind: 'xon' };
    } else if (first === 0x13) {
      reply = { kind: 'xoff' };
    } else if ((first & 0b1001_0011) === 0b0001_0010) {
      reply = { kind: 'dle-eot', n: this.requestedDleEot.shift(), byte: first };
    } else if ((first & 0b1001_0011) === 0b0001_0000) {
      if (this.pending.length < 4) return false;
      length = 4;
      reply = { kind: 'asb', bytes: this.pending.slice(0, 4) };
    } else {
      reply = { kind: 'unknown', byte: first };
    }

    this.pending.splice(0, length);
    const at = now();
    console.log(`${stamp(at)}    = ${describe(reply)}`);
    this.emit('reply', reply, at);
    return true;
  }

  /** Resolves with the arrival time of the first matching reply, or null after `timeoutMs` */
  waitFor(match: (reply: Reply) => boolean, timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      const onReply = (reply: Reply, at: number) => {
        if (!match(reply)) return;
        clearTimeout(timer);
        this.off('reply', onReply);
        resolve(at);
      };
      const timer = setTimeout(() => {
        this.off('reply', onReply);
        resolve(null);
      }, timeoutMs);
      this.on('reply', onReply);
    });
  }
}

// --- Transports ------------------------------------------------------------

async function openUsb(parser: ReplyParser): Promise<Transport> {
  const device = usb.findByIds(VENDOR_ID, PRODUCT_ID);
  if (!device) throw new Error('No TM-T20III found on USB');
  device.open();
  const iface = device.interface(0);
  if (iface.isKernelDriverActive()) {
    try {
      iface.detachKernelDriver();
    } catch {
      // not supported on every platform
    }
  }
  iface.claim();

  console.log(
    'USB endpoints on interface 0:',
    iface.endpoints.map(
      (ep) => `${ep.direction} 0x${ep.address.toString(16)} type ${ep.transferType}`,
    ),
  );
  const out = iface.endpoints.find((ep) => ep instanceof usb.OutEndpoint);
  const input = iface.endpoints.find((ep) => ep instanceof usb.InEndpoint);
  if (!out) throw new Error('No OUT endpoint');
  if (!input) {
    throw new Error(
      'No IN endpoint, so the printer cannot send status. Check the USB class setting in the TM-T20III Utility.',
    );
  }

  input.on('data', (data: Buffer) => {
    if (data.length > 0) parser.push(data);
  });
  input.on('error', (err: Error) => console.log(`${stamp()}  USB IN error: ${err.message}`));
  input.startPoll(1, 64);

  return {
    write: (bytes) =>
      new Promise((resolve, reject) => {
        out.transfer(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
      }),
    close: async () => {
      await new Promise<void>((resolve) => input.stopPoll(() => resolve()));
      await new Promise<void>((resolve) => iface.release(true, () => resolve()));
      device.close();
    },
  };
}

async function openNetwork(parser: ReplyParser, host: string, port: number): Promise<Transport> {
  const socket = connect({ host, port });
  socket.on('error', (err) => console.log(`${stamp()}  socket error: ${err.message}`));
  await once(socket, 'connect');
  socket.on('data', (data: Buffer) => parser.push(data));

  return {
    write: (bytes) =>
      new Promise((resolve, reject) => {
        socket.write(Buffer.from(bytes), (err) => (err ? reject(err) : resolve()));
      }),
    close: async () => {
      socket.end();
      await Promise.race([once(socket, 'close'), new Promise((r) => setTimeout(r, 2000))]);
      socket.destroy();
    },
  };
}

// --- Probe -----------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { values } = parseArgs({
    options: {
      host: { type: 'string' },
      port: { type: 'string', default: '9100' },
      interactive: { type: 'boolean', default: false },
    },
  });

  const parser = new ReplyParser();
  const transport = values.host
    ? await openNetwork(parser, values.host, Number(values.port))
    : await openUsb(parser);
  const findings: string[] = [];

  /** `dleEot` lists the DLE EOT requests in `bytes`, so their replies can be decoded */
  const send = async (label: string, bytes: number[], dleEotRequests: number[] = []) => {
    parser.requestedDleEot.push(...dleEotRequests);
    console.log(
      `${stamp()}  → ${label}${bytes.length <= 16 ? `: ${hex(bytes)}` : ` (${bytes.length} bytes)`}`,
    );
    await transport.write(bytes);
    return now();
  };

  const prompt = async (question: string) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(`\n>>> ${question} Press Enter to continue. `);
    rl.close();
  };

  try {
    console.log('\n## 1. Reset and real-time status (DLE EOT 1-4)');
    await send('ESC @', INIT);
    await sleep(300);
    const allAnswered = parser.waitFor(() => parser.requestedDleEot.length === 0, 1500);
    for (const n of [1, 2, 3, 4]) await send(`DLE EOT ${n}`, dleEot(n), [n]);
    const allStatus = await allAnswered;
    findings.push(
      allStatus === null
        ? `DLE EOT: ${parser.requestedDleEot.length} of 4 requests got no reply`
        : 'DLE EOT: all 4 requests answered',
    );

    console.log('\n## 2. GS ( H process ID with nothing queued');
    const idleWait = parser.waitFor((r) => r.kind === 'process-id' && r.id === '0001', 2000);
    const idleSent = await send('GS ( H "0001"', processId('0001'));
    const idleReply = await idleWait;
    findings.push(
      idleReply === null
        ? 'GS ( H: no reply with an empty buffer (unsupported, or a different reply format)'
        : `GS ( H: replied after ${(idleReply - idleSent).toFixed(0)}ms with an empty buffer`,
    );

    console.log('\n## 3. Timing: 40-line job, then DLE EOT 1 and GS ( H right behind it');
    const job = [...INIT, ...ascii('print-buddy status probe\n')];
    for (let i = 1; i <= 40; i++) job.push(...ascii(`line ${String(i).padStart(2)} of 40\n`));
    const statusWait = parser.waitFor((r) => r.kind === 'dle-eot', 3000);
    const doneWait = parser.waitFor((r) => r.kind === 'process-id' && r.id === '0002', 20000);
    await send('job', job);
    const jobSent = await send(
      'DLE EOT 1 + GS ( H "0002"',
      [...dleEot(1), ...processId('0002')],
      [1],
    );
    const [statusAt, doneAt] = await Promise.all([statusWait, doneWait]);
    findings.push(
      statusAt === null
        ? 'Timing: DLE EOT got no reply behind a job'
        : `Timing: DLE EOT replied ${(statusAt - jobSent).toFixed(0)}ms after the job was sent`,
      doneAt === null
        ? 'Timing: GS ( H "0002" never came back'
        : `Timing: GS ( H replied ${(doneAt - jobSent).toFixed(0)}ms after the job was sent. ` +
            'Compare with when the paper stopped moving.',
    );

    console.log('\n## 4. DLE EOT 1 bytes inside GS v 0 image data (not a request)');
    const image = [GS, 0x76, 0x30, 0x00, 0x04, 0x00, 0x01, 0x00, DLE, EOT, 0x01, 0x00];
    const strayWait = parser.waitFor((r) => r.kind === 'dle-eot' && r.n === undefined, 1500);
    await send('GS v 0, 32x1 dots, data 10 04 01 00', image);
    const stray = await strayWait;
    findings.push(
      stray === null
        ? 'Image data: 10 04 01 inside GS v 0 was NOT treated as DLE EOT'
        : 'Image data: 10 04 01 inside GS v 0 WAS treated as DLE EOT (real-time commands fire inside images)',
    );

    console.log('\n## 5. Automatic Status Back (GS a 0x4F)');
    const asbWait = parser.waitFor((r) => r.kind === 'asb', 2000);
    const asbSent = await send('GS a 0x4F', asb(0x4f));
    const firstAsb = await asbWait;
    findings.push(
      firstAsb === null
        ? 'ASB: nothing sent after enabling it'
        : `ASB: first report ${(firstAsb - asbSent).toFixed(0)}ms after enabling`,
    );

    if (values.interactive) {
      console.log('\n## 6. Cover open while a process ID is pending');
      await prompt('Open the roll paper cover and leave it open.');
      await sleep(500);
      await send('DLE EOT 2', dleEot(2), [2]);
      const isCoverId = (r: Reply) => r.kind === 'process-id' && r.id === '0003';
      const openWait = parser.waitFor(isCoverId, 3000);
      const coverSent = await send('job + GS ( H "0003"', [
        ...ascii('printed with the cover open?\n'),
        ...processId('0003'),
      ]);
      const whileOpen = await openWait;
      if (whileOpen === null) {
        const closeWait = parser.waitFor(isCoverId, 60000);
        await prompt('No reply yet. Close the cover.');
        const afterClose = await Promise.race([closeWait, sleep(10000).then(() => null)]);
        findings.push(
          afterClose === null
            ? 'Cover open: GS ( H "0003" never came back, even after closing'
            : 'Cover open: GS ( H waited until the cover was closed',
        );
      } else {
        findings.push(
          `Cover open: GS ( H replied ${(whileOpen - coverSent).toFixed(0)}ms later with the cover open`,
        );
        await prompt('Close the cover.');
      }
      await sleep(1000);
    }

    await send('GS a 0 (ASB off)', asb(0));
    await send('feed and partial cut', FEED_AND_CUT);
    await sleep(1000);
  } finally {
    await transport.close();
  }

  console.log('\n## Findings');
  for (const finding of findings) console.log(`- ${finding}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
