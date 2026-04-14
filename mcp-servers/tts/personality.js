import { readFileSync, writeFileSync, existsSync } from 'fs';
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
 * If the user copy doesn't exist yet, creates it by writing the passed values.
 */
export function writePersonality(pluginRoot, { userName, companionName, personality }) {
  const doc = { user_name: userName || '', companionName, personality };
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
