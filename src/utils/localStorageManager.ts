import type { RecordedPerformance } from '../types/music';

const IDB_NAME = 'treblearts_media_v1';
const IDB_STORE = 'recordings';

export function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalJson<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Gracefully evict oldest entries if array payload hits browser storage quota
    if (Array.isArray(value) && value.length > 1) {
      let trimmed = value.slice(0, Math.max(1, Math.floor(value.length / 2)));
      while (trimmed.length >= 1) {
        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
          return true;
        } catch {
          if (trimmed.length === 1) break;
          trimmed = trimmed.slice(0, Math.floor(trimmed.length / 2));
        }
      }
    }
    return false;
  }
}

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveRecordedAudioToIdb(id: string, audioDataUrl: string): Promise<void> {
  if (!audioDataUrl) return;
  const db = await openMediaDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(audioDataUrl, id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadRecordedAudioMapFromIdb(
  ids: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const db = await openMediaDb();
  if (!db) return result;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = () => {
          if (typeof req.result === 'string' && req.result) {
            result.set(id, req.result);
          }
        };
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });

  return result;
}

/**
 * Strips heavy base64 audio payloads before persisting metadata to localStorage
 * so localStorage never hits its 5 MB quota; audio lives in IndexedDB instead.
 */
export function compactPerformancesForLocalStorage(
  performances: RecordedPerformance[]
): RecordedPerformance[] {
  return performances.slice(0, 15).map((p) => ({
    ...p,
    audioDataUrl: p.audioDataUrl.length <= 2048 ? p.audioDataUrl : '',
  }));
}
