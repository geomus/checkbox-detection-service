import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const detectorDir = path.resolve(rootDir, 'services/detector');

const children = [
  spawn('yarn', ['serverless', 'offline'], { cwd: rootDir, stdio: 'inherit' }),
  spawn('.venv/bin/python', ['dev_server.py'], { cwd: detectorDir, stdio: 'inherit' }),
];

let shuttingDown = false;
const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
for (const child of children) child.on('exit', (code) => shutdown(code ?? 0));
