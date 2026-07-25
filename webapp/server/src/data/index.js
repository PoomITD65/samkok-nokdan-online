import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(path.join(__dirname, name), 'utf-8'));

export const GENERALS = load('generals.json');
export const GENERALS_BY_ID = Object.fromEntries(GENERALS.map((g) => [g.id, g]));

export const ROLES_DATA = load('roles.json');
export const ROLES = ROLES_DATA.roles;
export const ROLES_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));
export const ROLE_COUNTS_BY_PLAYER_COUNT = ROLES_DATA.countsByPlayerCount;

export const SUPPLY = load('supply.json');
export const SUPPLY_BY_ID = Object.fromEntries(SUPPLY.map((c) => [c.id, c]));

export const INFANTRY = load('infantry.json');

export function allGameData() {
  return { generals: GENERALS, roles: ROLES, supply: SUPPLY, infantry: INFANTRY };
}
