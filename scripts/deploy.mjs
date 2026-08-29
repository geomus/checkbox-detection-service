import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STACK = 'checkbox-detection-service-dev';
const profile = process.env.AWS_PROFILE ?? 'personal';

const run = (cmd, args, env) =>
  execFileSync(cmd, args, { cwd: rootDir, stdio: 'inherit', env: { ...process.env, ...env } });

// serverless builds the detector image with the `docker` CLI. Recent Docker Desktop
// installs it under ~/.docker/bin and does not always add that to the shell PATH,
// so add it here if `docker` is otherwise missing, and say so.
const ensureDocker = () => {
  const present = () => {
    try {
      execFileSync('docker', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  if (present()) return;
  const userBin = path.join(homedir(), '.docker/bin');
  if (existsSync(path.join(userBin, 'docker'))) {
    process.env.PATH = `${userBin}:${process.env.PATH}`;
    console.log(
      `docker: added ${userBin} to PATH (add it to your shell profile to make this permanent)`
    );
  }
  if (!present()) {
    console.error(
      'docker CLI not found. Start Docker Desktop and make sure `docker --version` works.'
    );
    process.exit(1);
  }
};

// The detector image and its build layers are all in ECR after a push, so drop
// the local copies. Never let a cleanup hiccup fail an otherwise good deploy.
const cleanupDockerImages = () => {
  try {
    const listed = execFileSync('docker', ['images', '--format', '{{.ID}} {{.Repository}}'], {
      encoding: 'utf8'
    }).trim();
    const ids = [
      ...new Set(
        listed
          .split('\n')
          .filter((line) => line.includes('serverless-checkbox-detection-service'))
          .map((line) => line.split(' ')[0])
      )
    ];
    if (ids.length) run('docker', ['rmi', '-f', ...ids]);
    run('docker', ['image', 'prune', '-f']);
  } catch (err) {
    console.warn(`docker cleanup skipped: ${err.message}`);
  }
};

ensureDocker();

// 1. bundle the api so serverless has something to package
run('yarn', ['workspace', 'api', 'build']);

// 2. deploy the stack: api lambda, detector image, and the web bucket
run('yarn', ['serverless', 'deploy']);

// 3. read what the deploy produced
const outputs = JSON.parse(
  execFileSync(
    'aws',
    [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      STACK,
      '--profile',
      profile,
      '--query',
      'Stacks[0].Outputs',
      '--output',
      'json'
    ],
    { cwd: rootDir, encoding: 'utf8' }
  )
);
const output = (key) => outputs.find((o) => o.OutputKey === key)?.OutputValue;
const apiUrl = output('HttpApiUrl');
const bucket = output('WebBucketName');
const siteUrl = output('WebsiteURL');
if (!apiUrl || !bucket || !siteUrl) {
  throw new Error(
    `stack is missing an expected output: ${JSON.stringify({ apiUrl, bucket, siteUrl })}`
  );
}

// 4. build the web app against the deployed api, then push it to the bucket
run('yarn', ['workspace', 'web', 'build'], { VITE_API_URL: apiUrl });
run('aws', ['s3', 'sync', 'apps/web/dist', `s3://${bucket}`, '--delete', '--profile', profile]);

// 5. drop the local detector image left by the build
cleanupDockerImages();

console.log(`\nFrontend: ${siteUrl}`);
console.log(`API:      ${apiUrl}`);
