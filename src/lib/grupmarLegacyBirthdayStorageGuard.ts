const LEGACY_BIRTHDAY_STORAGE_PATTERNS = [
  /birthday/i,
  /birthdays/i,
  /cumple/i,
  /cumpleanos/i,
  /cumpleaños/i,
  /celebrat/i,
  /grupmar.*message/i,
  /grupmar.*home/i,
];

let alreadyPurged = false;

function purgeStorage(storage: Storage, storageName: string) {
  const removed: string[] = [];

  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key) continue;

    if (LEGACY_BIRTHDAY_STORAGE_PATTERNS.some((pattern) => pattern.test(key))) {
      storage.removeItem(key);
      removed.push(key);
    }
  }

  if (removed.length) {
    console.warn(`[GrupMar Time] ${storageName}: eliminadas claves legacy de cumpleaños`, removed);
  }
}

export function purgeLegacyBirthdayStorage() {
  if (alreadyPurged) return;
  alreadyPurged = true;

  if (typeof window === "undefined") return;

  try { purgeStorage(window.localStorage, "localStorage"); } catch {}
  try { purgeStorage(window.sessionStorage, "sessionStorage"); } catch {}
}
