// Copies static PWA assets into dist/ after Vite build
import { cpSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const dist = join(root, 'dist');

const files = [
  'manifest.json',
  'firebase-messaging-sw.js',
];
const dirs = ['icons'];

for (const f of files) {
  const src = join(root, f);
  if (existsSync(src)) {
    cpSync(src, join(dist, f));
    console.log(`  copied ${f}`);
  }
}

for (const d of dirs) {
  const src = join(root, d);
  if (existsSync(src)) {
    cpSync(src, join(dist, d), { recursive: true });
    console.log(`  copied ${d}/`);
  }
}

console.log('Static assets copied to dist/');
