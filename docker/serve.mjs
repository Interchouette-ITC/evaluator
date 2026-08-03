import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['dist/apps/evaluator-backend/main.js'], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['dist/evaluator/server/server.js'], {
    stdio: 'inherit',
  }),
];

function shutdown(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

for (const child of children) {
  child.on('exit', (code, signal) => {
    shutdown('SIGTERM');
    process.exit(code ?? (signal ? 1 : 0));
  });
}
