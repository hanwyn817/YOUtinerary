import { derived, writable } from 'svelte/store';
import {
  createItinerary,
  deleteItinerary,
  fetchItineraries,
  fetchItinerary,
  unlockEditing,
  updateItinerary
} from '../api/client';
import type { Itinerary, ItineraryMeta, UnlockResponse } from '../types';

interface StoreState {
  list: ItineraryMeta[];
  activeItinerary: Itinerary | null;
  loading: boolean;
  error: string | null;
  editingUnlocked: boolean;
  unlocking: boolean;
}

const initialState: StoreState = {
  list: [],
  activeItinerary: null,
  loading: false,
  error: null,
  editingUnlocked: false,
  unlocking: false
};

function createStore() {
  const { subscribe, update, set } = writable<StoreState>(initialState);

  async function loadList() {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const items = await fetchItineraries();
      update((state) => ({ ...state, list: items, loading: false }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: (error as Error).message }));
    }
  }

  async function selectItinerary(id: string) {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const item = await fetchItinerary(id);
      update((state) => ({ ...state, activeItinerary: item, loading: false }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: (error as Error).message }));
    }
  }

  async function createDraft(payload: Partial<Itinerary>) {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const created = await createItinerary(payload);
      update((state) => ({
        ...state,
        list: [created, ...state.list],
        activeItinerary: created,
        loading: false
      }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: (error as Error).message }));
    }
  }

  async function persistItinerary(id: string, payload: Partial<Itinerary>): Promise<boolean> {
    update((state) => ({ ...state, error: null }));
    try {
      const item = await updateItinerary(id, payload);
      update((state) => ({
        ...state,
        list: state.list.map((it) => (it.id === item.id ? item : it)),
        activeItinerary: item
      }));
      return true;
    } catch (error) {
      update((state) => ({ ...state, error: (error as Error).message }));
      return false;
    }
  }

  async function removeItinerary(id: string): Promise<boolean> {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      await deleteItinerary(id);
      update((state) => ({
        ...state,
        loading: false,
        activeItinerary: state.activeItinerary?.id === id ? null : state.activeItinerary,
        list: state.list.filter((it) => it.id !== id)
      }));
      return true;
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: (error as Error).message }));
      return false;
    }
  }

  async function unlock(password: string): Promise<UnlockResponse> {
    update((state) => ({ ...state, unlocking: true, error: null }));
    try {
      const result = await unlockEditing({ password });
      if (result.ok) {
        update((state) => ({ ...state, unlocking: false, editingUnlocked: true }));
      } else {
        update((state) => ({ ...state, unlocking: false, error: result.error ?? '密码错误' }));
      }
      return result;
    } catch (error) {
      const message = (error as Error).message || '密码验证失败';
      update((state) => ({ ...state, unlocking: false, error: message }));
      return { ok: false, error: message };
    }
  }

  function clearError() {
    update((state) => ({ ...state, error: null }));
  }

  const hasItineraries = derived({ subscribe }, ($state) => $state.list.length > 0);

  return {
    subscribe,
    loadList,
    selectItinerary,
    createDraft,
    persistItinerary,
    removeItinerary,
    unlock,
    clearError,
    hasItineraries
  };
}

export const itineraryStore = createStore();
