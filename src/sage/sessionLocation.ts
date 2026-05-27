import fs from 'fs';
import path from 'path';
import type { Defaults } from '../memory/store.js';

const DEFAULTS_FILE = path.join(process.cwd(), 'data/defaults.json');

export type SessionLocationSource = 'command' | 'defaults.json' | 'env' | 'none';

export function loadDefaultsFile(): Defaults {
  try {
    return JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf-8')) as Defaults;
  } catch {
    return {};
  }
}

export function normalizeLocationId(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return String(value);
}

/**
 * Resolve entity/location for getAPISession.
 * Priority: explicit command value > data/defaults.json > SAGE_LOCATION_ID env
 */
export function resolveSessionLocationId(
  explicit?: string,
  defaults?: Defaults
): string | undefined {
  const fromCommand = normalizeLocationId(explicit);
  if (fromCommand) {
    return fromCommand;
  }

  const defs = defaults ?? loadDefaultsFile();
  const fromDefaults = normalizeLocationId(defs.locationId);
  if (fromDefaults) {
    return fromDefaults;
  }

  return normalizeLocationId(process.env.SAGE_LOCATION_ID);
}

export function describeSessionLocationSource(
  explicit?: string,
  defaults?: Defaults
): SessionLocationSource {
  if (normalizeLocationId(explicit)) {
    return 'command';
  }
  const defs = defaults ?? loadDefaultsFile();
  if (normalizeLocationId(defs.locationId)) {
    return 'defaults.json';
  }
  if (normalizeLocationId(process.env.SAGE_LOCATION_ID)) {
    return 'env';
  }
  return 'none';
}
