import { nanoid } from 'nanoid';

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Math.random is fine here (not banned in normal server code, only in Workflow scripts).
export function pseudoRandom() {
  return Math.random();
}

export function pick(arr, n) {
  return shuffle(arr).slice(0, n);
}

export function newId(prefix) {
  return `${prefix}_${nanoid(8)}`;
}

export function removeOnce(arr, predicate) {
  const idx = arr.findIndex(predicate);
  if (idx === -1) return null;
  return arr.splice(idx, 1)[0];
}
