import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { ItemAssignments, Person, TaxServiceSettings } from './session';

export type HistoryItem = { name: string; pricePiastres: number; quantity: number };

export type HistoryEntry = {
  id: string;
  completedAt: string;
  photoUris: string[];
  items: HistoryItem[];
  taxService: TaxServiceSettings;
  people: Person[];
  itemAssignments: ItemAssignments;
};

const HISTORY_STORAGE_KEY = 'asemly:history';

function historyPhotosDirectory(): Directory {
  // Paths.document (not Paths.cache) — the original capture/pick URI lives in
  // a cache directory the OS is free to clear, which would silently orphan a
  // history entry's photo. Copying into Documents makes it durable for as
  // long as the history entry itself exists.
  const directory = new Directory(Paths.document, 'history-photos');
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

/**
 * Persists a just-completed split to on-device history. Best-effort by
 * design — a failure here must never block the fronter from seeing their
 * own just-completed split (FinalSplitScreen swallows this call's errors).
 */
export async function saveSplitToHistory(entry: {
  photoUris: string[];
  items: HistoryItem[];
  taxService: TaxServiceSettings;
  people: Person[];
  itemAssignments: ItemAssignments;
}): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Copy every photo into durable storage, numbered so each gets a distinct
  // filename in the shared history-photos directory.
  const persistedPhotoUris = entry.photoUris.map((uri, index) => {
    const destination = new File(historyPhotosDirectory(), `${id}-${index}.jpg`);
    new File(uri).copy(destination);
    return destination.uri;
  });

  const newEntry: HistoryEntry = {
    id,
    completedAt: new Date().toISOString(),
    photoUris: persistedPhotoUris,
    items: entry.items,
    taxService: entry.taxService,
    people: entry.people,
    itemAssignments: entry.itemAssignments,
  };

  const existing = await loadSplitHistory();
  await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([newEntry, ...existing]));
}

/** Newest first — saveSplitToHistory always prepends, so no re-sort needed. */
export async function loadSplitHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function loadHistoryEntry(id: string): Promise<HistoryEntry | null> {
  const entries = await loadSplitHistory();
  return entries.find((entry) => entry.id === id) ?? null;
}
