import { useState, useCallback, useMemo, useRef } from 'react';
import { Novel } from '../types';
import {
  fetchServerStorage,
  saveStoredNovels,
  deleteStoredNovel,
  renameStoredNovel,
  LibraryStorageData,
} from '../services/storage';

export interface ReloadOptions {
  preferredNovelId?: string;
  force?: boolean;
  cooldownMs?: number;
}

export interface UseLibraryReturn {
  novels: Novel[];
  activeNovelId: string | null;
  activeNovel: Novel | null;
  isLoading: boolean;
  setActiveNovelId: (id: string | null) => void;
  setNovels: React.Dispatch<React.SetStateAction<Novel[]>>;
  reloadLibraryFromDisk: (
    preferredNovelIdOrOptions?: string | ReloadOptions,
    explicitOptions?: ReloadOptions
  ) => Promise<LibraryStorageData | null>;
  addNovel: (novel: Novel) => void;
  updateNovel: (id: string, patch: Partial<Novel>) => void;
  removeNovel: (id: string) => void;
  renameNovel: (id: string, newTitle: string) => void;
}

export function useLibrary(initialNovels: Novel[] = []): UseLibraryReturn {
  const [novels, setNovels] = useState<Novel[]>(initialNovels);
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const lastFetchTimeRef = useRef<number>(0);
  const lastKnownLastUpdatedRef = useRef<string | null>(null);

  const activeNovel = useMemo(() => {
    return novels.find((n) => n.id === activeNovelId) || null;
  }, [novels, activeNovelId]);

  const reloadLibraryFromDisk = useCallback(
    async (
      preferredNovelIdOrOptions?: string | ReloadOptions,
      explicitOptions?: ReloadOptions
    ): Promise<LibraryStorageData | null> => {
      let options: ReloadOptions = {};
      if (typeof preferredNovelIdOrOptions === 'string') {
        options = { preferredNovelId: preferredNovelIdOrOptions, ...explicitOptions };
      } else if (preferredNovelIdOrOptions && typeof preferredNovelIdOrOptions === 'object') {
        options = { ...preferredNovelIdOrOptions, ...explicitOptions };
      } else if (explicitOptions) {
        options = explicitOptions;
      }

      const { preferredNovelId, force = false, cooldownMs = 0 } = options;

      // Cooldown throttle: skip network request if within cooldown window and not forced
      if (!force && cooldownMs > 0 && lastFetchTimeRef.current !== 0) {
        const elapsed = Date.now() - lastFetchTimeRef.current;
        if (elapsed < cooldownMs) {
          return null;
        }
      }

      setIsLoading(true);
      try {
        const serverData = await fetchServerStorage();
        lastFetchTimeRef.current = Date.now();

        if (serverData && Array.isArray(serverData.novels) && serverData.novels.length > 0) {
          const isSameVersion =
            !force &&
            Boolean(
              serverData._notModified ||
                (lastKnownLastUpdatedRef.current &&
                  serverData.last_updated &&
                  lastKnownLastUpdatedRef.current === serverData.last_updated)
            );

          if (!isSameVersion || novels.length === 0) {
            setNovels(serverData.novels);
            if (serverData.last_updated) {
              lastKnownLastUpdatedRef.current = serverData.last_updated;
            }
          }

          const targetId = preferredNovelId || activeNovelId || serverData.novels[0].id;
          setActiveNovelId(targetId);
          return serverData;
        }
      } catch (e) {
        console.warn('Failed reloading storage from server disk:', e);
      } finally {
        setIsLoading(false);
      }
      return null;
    },
    [activeNovelId, novels.length]
  );

  const addNovel = useCallback((newNovel: Novel) => {
    setNovels((prev) => {
      const updated = [newNovel, ...prev];
      saveStoredNovels(updated);
      return updated;
    });
    setActiveNovelId(newNovel.id);
  }, []);

  const updateNovel = useCallback((id: string, patch: Partial<Novel>) => {
    setNovels((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n));
      saveStoredNovels(updated);
      return updated;
    });
  }, []);

  const removeNovel = useCallback((id: string) => {
    const updatedNovels = deleteStoredNovel(id);
    setNovels(updatedNovels);
    setActiveNovelId((prev) => {
      if (prev === id) {
        return updatedNovels.length > 0 ? updatedNovels[0].id : null;
      }
      return prev;
    });
  }, []);

  const renameNovel = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const updatedNovels = renameStoredNovel(id, trimmed);
    setNovels(updatedNovels);
  }, []);

  return {
    novels,
    activeNovelId,
    activeNovel,
    isLoading,
    setActiveNovelId,
    setNovels,
    reloadLibraryFromDisk,
    addNovel,
    updateNovel,
    removeNovel,
    renameNovel,
  };
}
