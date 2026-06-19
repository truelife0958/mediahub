import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function quoteWindowsCmdArg(arg) {
  if (arg === '') return '""';
  if (!/[ \t&()<>^|"%]/.test(arg)) return arg;
  return `"${arg.replace(/(["^&|<>])/g, '^$1').replace(/%/g, '%%')}"`;
}

export function spawnNpm(args, options = {}) {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    const command = ['npm', ...args].map(quoteWindowsCmdArg).join(' ');
    return spawn('cmd.exe', ['/d', '/s', '/c', command], {
      ...options,
      shell: false,
    });
  }

  return spawn('npm', args, {
    ...options,
    shell: false,
  });
}

export function exitWithChild(child) {
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}
