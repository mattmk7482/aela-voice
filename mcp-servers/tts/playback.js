import { execSync } from 'child_process';
import { unlinkSync } from 'fs';

/**
 * Play a WAV file using the platform's built-in audio command.
 * Blocks until playback completes, then deletes the file.
 */
export function playAndDelete(filePath) {
  try {
    const cmd = getPlayCommand(filePath);
    execSync(cmd, { stdio: 'ignore' });
  } finally {
    try { unlinkSync(filePath); } catch { /* already gone */ }
  }
}

/**
 * Play a WAV file without deleting it.
 */
export function play(filePath) {
  const cmd = getPlayCommand(filePath);
  execSync(cmd, { stdio: 'ignore' });
}

function getPlayCommand(filePath) {
  const escaped = filePath.replace(/'/g, "'\\''");
  switch (process.platform) {
    case 'win32':
      return `powershell -NoProfile -Command "(New-Object System.Media.SoundPlayer '${filePath}').PlaySync()"`;
    case 'darwin':
      return `afplay '${escaped}'`;
    case 'linux':
      return `aplay '${escaped}' 2>/dev/null || paplay '${escaped}'`;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
