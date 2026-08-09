import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';

const fail = (message) => {
  throw new Error(message);
};
const denied = async (fn, label) => {
  try {
    await fn();
  } catch {
    return true;
  }
  fail(`${label} unexpectedly available`);
};
const connect = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, 1500);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

if (process.getuid() === 0) fail('sandbox is root');
const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
];
if (proxyKeys.some((key) => key in process.env))
  fail('proxy control environment present');
for (const path of [
  '/var/run/docker.sock',
  '/run/docker.sock',
  '/run/containerd/containerd.sock',
]) {
  if (fs.existsSync(path)) fail('host control socket present');
}
await denied(() => dns.lookup('github.com'), 'DNS');
await denied(() => connect('1.1.1.1', 443), 'public TCP');
await denied(() => connect('172.17.0.1', 80), 'Docker host TCP');
await denied(
  () => fetch('https://api.github.com', { signal: AbortSignal.timeout(1500) }),
  'GitHub HTTPS'
);
const assetRoot = '/workspace/public/models/synty';
const queue = [assetRoot];
let assetFile;
while (queue.length && !assetFile) {
  const dir = queue.pop();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) fail('asset symlink present');
    if (entry.isDirectory()) queue.push(path);
    else if (entry.isFile()) {
      assetFile = path;
      break;
    } else fail('asset special file present');
  }
}
if (!assetFile) fail('asset stage empty');
await denied(() => fs.promises.appendFile(assetFile, 'x'), 'asset write');
fs.writeFileSync('/workspace/.sandbox-write-canary', 'ok');
fs.unlinkSync('/workspace/.sandbox-write-canary');
process.stdout.write(
  JSON.stringify({
    schema: 'sandbox-canary/v1',
    dns: false,
    tcp: false,
    github: false,
    proxy: false,
    host: false,
    socket: false,
    assetsReadOnly: true,
    nonroot: process.getuid() !== 0,
  }) + '\n'
);
