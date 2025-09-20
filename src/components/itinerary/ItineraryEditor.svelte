<script lang="ts">
  import { onMount } from 'svelte';
  import { itineraryStore } from '../../lib/stores/itineraries';
  import PasswordGate from './PasswordGate.svelte';
  import ItineraryWorkspace from './ItineraryWorkspace.svelte';
  import { createEmptyDay } from '../../lib/utils/itinerary';
  import type { Itinerary } from '../../lib/types';

  export let itineraryId: string;

  let requestedUnlock = false;
  let newDraftInitialized = false;

  $: state = $itineraryStore;
  $: active = state.activeItinerary;

onMount(() => {
  itineraryStore.clearError();
  if (itineraryId === 'new') {
    if (state.editingUnlocked) {
      initializeNewDraft();
    } else {
      requestedUnlock = true;
    }
  } else {
    itineraryStore.selectItinerary(itineraryId);
  }
});

$: if (itineraryId === 'new' && state.editingUnlocked && !newDraftInitialized) {
  initializeNewDraft();
}

  $: if (itineraryId === 'new' && newDraftInitialized && active?.id && typeof window !== 'undefined') {
    if (window.location.pathname !== `/itinerary/${active.id}`) {
      window.history.replaceState({}, '', `/itinerary/${active.id}`);
    }
  }

  function initializeNewDraft() {
    if (newDraftInitialized) return;
    newDraftInitialized = true;
    const now = new Date();
    itineraryStore.createDraft(createTemplate(now));
  }

  function createTemplate(now: Date): Partial<Itinerary> {
    return {
      title: '未命名行程',
      slug: `trip-${now.getTime()}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      baseCurrency: 'CNY',
      description: '',
      days: [createEmptyDay(1)],
      attachments: [],
      totalBudget: {
        transport: 0,
        stay: 0,
        activities: 0,
        others: 0,
        currency: 'CNY'
      }
    };
  }

  function handleUnlock(password: string) {
    itineraryStore.unlock(password).then((res) => {
      if (res.ok) {
        requestedUnlock = false;
        if (itineraryId === 'new') {
          initializeNewDraft();
        } else if (!active || active.id !== itineraryId) {
          itineraryStore.selectItinerary(itineraryId);
        }
      }
    });
  }

  function ensureUnlocked() {
    requestedUnlock = true;
  }
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex flex-col gap-2">
      <a href="/" class="text-xs text-sky-600 hover:text-sky-500">← 返回总览</a>
      <h1 class="text-2xl font-semibold text-slate-800">
        {#if active}
          编辑：{active.title}
        {:else if itineraryId === 'new'}
          新建行程草稿
        {:else}
          加载中...
        {/if}
      </h1>
      {#if active?.description}
        <p class="text-sm text-slate-500">{active.description}</p>
      {/if}
    </div>
    <div class="flex flex-wrap gap-3">
      {#if !state.editingUnlocked}
        <button
          class="inline-flex items-center justify-center rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-100"
          on:click={ensureUnlocked}
        >
          解锁编辑
        </button>
      {/if}
      <a
        href={`/itinerary/${active?.id ?? itineraryId}`}
        class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-sky-400 hover:text-sky-500"
      >
        刷新
      </a>
    </div>
  </div>

  {#if state.loading && !active}
    <div class="flex min-h-[300px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
      正在加载行程详情...
    </div>
  {:else if active}
    <ItineraryWorkspace />
  {:else}
    <div class="flex min-h-[200px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
      暂无可编辑的行程，请先解锁或新建。
    </div>
  {/if}

  <PasswordGate
    visible={requestedUnlock}
    unlocking={state.unlocking}
    error={state.error}
    on:unlocked={(event) => handleUnlock(event.detail)}
    on:cancel={() => (requestedUnlock = false)}
  />
</div>
