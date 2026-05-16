import { mkdir, copyFile } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const snapshotsDir = path.join(root, 'e2e', 'visual-regression.spec.js-snapshots');
const baselineDir = path.join(root, 'e2e', 'visual-baselines');

const FILES = [
  'home-desktop.png',
  'home-mobile.png',
  'admin-desktop.png',
  'admin-mobile.png',
];

function resolveSnapshotPath(file) {
  const candidates = [
    path.join(snapshotsDir, `${file.replace('.png', '')}-linux.png`),
    path.join(snapshotsDir, file),
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.F_OK);
      return candidate;
    } catch {
      // noop
    }
  }
  return null;
}

await mkdir(baselineDir, { recursive: true });

const copied = [];
for (const file of FILES) {
  const src = resolveSnapshotPath(file);
  if (!src) {
    throw new Error(`缺少视觉快照文件: ${file}，请先执行 npm run test:visual:update`);
  }
  const dest = path.join(baselineDir, file);
  await copyFile(src, dest);
  copied.push({ src, dest });
}

console.log(JSON.stringify({ copied }, null, 2));
