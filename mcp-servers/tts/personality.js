import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';

const USER_STATE_DIR = join(homedir(), '.claude', 'aela-plugin');
const USER_PERSONALITY_PATH = join(USER_STATE_DIR, 'personality.yaml');

/**
 * Resolve the personality file path — user copy if present, plugin template otherwise.
 */
function personalityPath(pluginRoot) {
  if (existsSync(USER_PERSONALITY_PATH)) return USER_PERSONALITY_PATH;
  return join(pluginRoot, 'personality', 'default.yaml');
}

/**
 * Parse the personality YAML — user copy or template.
 */
export function readPersonality(pluginRoot) {
  const doc = YAML.parse(readFileSync(personalityPath(pluginRoot), 'utf-8'));
  return {
    userName: doc?.user_name || '',
    companionName: doc?.companionName ?? 'Aela',
    personality: doc?.personality ?? '',
  };
}

/**
 * Write personality YAML back to disk. Always writes the user copy — never touches the template.
 * Creates the user state directory if absent. Reads the existing user copy or template first
 * and patches only the fields passed in, so unknown top-level fields (e.g. how_i_remember in
 * Phase 4) are preserved across writes.
 */
export function writePersonality(pluginRoot, patch) {
  mkdirSync(USER_STATE_DIR, { recursive: true });

  // Start from whatever's currently authoritative — user copy if present, template otherwise.
  // If neither exists, start from an empty object so the passed patch becomes the whole file.
  let doc = {};
  const srcPath = personalityPath(pluginRoot);
  if (existsSync(srcPath)) {
    doc = YAML.parse(readFileSync(srcPath, 'utf-8')) || {};
  }

  // Map the camelCase patch keys to the YAML snake_case layout.
  if ('userName' in patch) doc.user_name = patch.userName || '';
  if ('companionName' in patch) doc.companionName = patch.companionName;
  if ('personality' in patch) doc.personality = patch.personality;

  writeFileSync(USER_PERSONALITY_PATH, YAML.stringify(doc), 'utf-8');
}

/**
 * Build the final personality text with placeholders resolved.
 * If userName is not passed, reads it from the personality file.
 */
export function buildPersonality(pluginRoot, userName) {
  const { userName: fileUserName, companionName, personality } = readPersonality(pluginRoot);
  const name = userName || fileUserName || 'friend';
  return personality
    .replace(/\{\{companionName\}\}/g, companionName)
    .replace(/\{\{userName\}\}/g, name);
}
