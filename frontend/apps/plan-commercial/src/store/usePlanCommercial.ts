/**
 * Shared session-state hook for the Plan Commercial pages.
 *
 * Each page used to fetch the deck state + product list + image library on its
 * own, but they share state heavily (changing a packshot in the SlideEditor
 * needs the library reloaded, generating a deck mutates the archive). One
 * Zustand store keeps everything in sync without prop drilling.
 */
import { create } from 'zustand';
import type { ImageAsset } from '@amafin/ui';
import * as api from '../api';
import type { DeckState, ProductRow } from '../api';

export interface PCStore {
  state: DeckState | null;
  products: ProductRow[];
  images: ImageAsset[];
  loading: boolean;
  /** ms timestamp that bumps every time something changes — used as a cache
   *  buster on the preview <img src> URL so it reloads after each edit. */
  previewBust: number;

  /** Optimistic — mutate the local state, then sync. */
  bumpPreview: () => void;
  refreshState: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  refreshImages: () => Promise<void>;
  refreshAll: () => Promise<void>;

  patchProductLocal: (idx: number, patch: Partial<ProductRow>) => void;
  patchProduct: (idx: number, patch: Partial<ProductRow>) => Promise<void>;
}

export const usePlanCommercial = create<PCStore>((set, get) => ({
  state: null,
  products: [],
  images: [],
  loading: false,
  previewBust: Date.now(),

  bumpPreview: () => set({ previewBust: Date.now() }),

  refreshState: async () => {
    const s = await api.getState();
    set({ state: s });
  },
  refreshProducts: async () => {
    const r = await api.listProducts();
    set({ products: r.items });
  },
  refreshImages: async () => {
    const list = await api.listImages();
    set({ images: list });
  },
  refreshAll: async () => {
    set({ loading: true });
    try {
      const [s, p, i] = await Promise.all([
        api.getState(), api.listProducts(), api.listImages(),
      ]);
      set({ state: s, products: p.items, images: i });
    } finally {
      set({ loading: false });
    }
  },

  patchProductLocal: (idx, patch) => {
    const products = [...get().products];
    if (idx < 0 || idx >= products.length) return;
    products[idx] = { ...products[idx], ...patch };
    set({ products, previewBust: Date.now() });
  },
  patchProduct: async (idx, patch) => {
    get().patchProductLocal(idx, patch);
    const r = await api.patchProduct(idx, patch);
    const products = [...get().products];
    products[idx] = r.item;
    set({ products, previewBust: Date.now() });
  },
}));
