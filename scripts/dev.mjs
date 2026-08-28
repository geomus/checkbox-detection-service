import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const detectorDir = path.resolve(rootDir, 'services/detector');

// Matches provider.profile in serverless.yml. strategy=textract calls real AWS even in local
// dev, strategy=opencv never does. Override with `AWS_PROFILE=<name> yarn dev`.
const AWS_PROFILE = process.env.AWS_PROFILE ?? 'personal';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

// Is that profile set up on this machine? SSO profiles live in ~/.aws/config only.
const awsProfileExists = () => {
  const section = new RegExp(`^\\[(profile )?${AWS_PROFILE}\\]`, 'm');
  for (const file of ['config', 'credentials']) {
    try {
      if (section.test(readFileSync(path.join(homedir(), '.aws', file), 'utf8'))) return true;
    } catch {
      // file not there, keep looking
    }
  }
  return false;
};

// serverless-offline resolves AWS credentials on startup. Use real ones if they are reachable
// so strategy=textract works locally; otherwise feed it a placeholder so a fresh clone boots
// the opencv path with no SSO prompt (strategy=textract just won't work until credentials exist).
let env;
if (process.env.AWS_ACCESS_KEY_ID) {
  env = process.env;
  console.log('AWS: using credentials from the environment');
} else if (awsProfileExists()) {
  env = { ...process.env, AWS_PROFILE, AWS_REGION };
  console.log(`AWS: using profile "${AWS_PROFILE}"`);
} else {
  env = { ...process.env, AWS_ACCESS_KEY_ID: 'offline', AWS_SECRET_ACCESS_KEY: 'offline', AWS_REGION };
  console.log('AWS: no credentials found, strategy=textract will not work locally');
}

const children = [
  spawn('yarn', ['serverless', 'offline'], { cwd: rootDir, stdio: 'inherit', env }),
  spawn('.venv/bin/python', ['dev_server.py'], { cwd: detectorDir, stdio: 'inherit' }),
  // Point the web dev server at the local API so `yarn dev` is the whole stack in one command.
  spawn('yarn', ['workspace', 'web', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...env, VITE_API_URL: 'http://localhost:3000' },
  }),
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
