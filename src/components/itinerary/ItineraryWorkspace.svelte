<script lang="ts">
  import { onMount } from 'svelte';
  import { itineraryStore } from '../../lib/stores/itineraries';
  import type {
    DayItem,
    DayItemType,
    Itinerary,
    ItineraryDay,
    LocationPoint,
    TransportMode
  } from '../../lib/types';
  import { createDayItem, createEmptyDay, uid } from '../../lib/utils/itinerary';
  import { DAY_ITEM_OPTIONS, getDayItemLabel, suggestGaodeMode } from '../../lib/utils/schedule';

  const transportOptions: { value: TransportMode; label: string }[] = [
    { value: 'plane', label: '飞机' },
    { value: 'train', label: '火车' },
    { value: 'high-speed-rail', label: '高铁/城际' },
    { value: 'bus', label: '长途/大巴' },
    { value: 'subway', label: '地铁' },
    { value: 'car', label: '自驾/租车' },
    { value: 'taxi', label: '出租/网约' },
    { value: 'rideshare', label: '拼车/顺风' },
    { value: 'ferry', label: '轮渡' },
    { value: 'bike', label: '骑行' },
    { value: 'walk', label: '步行' },
    { value: 'other', label: '其他' }
  ];

  const currencyOptions = ['CNY', 'JPY', 'USD', 'HKD', 'EUR', 'GBP', 'AUD', 'TWD', 'KRW', 'THB', 'OTHER'];

  type TransportItem = Extract<DayItem, { type: 'transport' }>;

  let draft: Itinerary | null = null;
  let dirty = false;
  let exporting = false;
  let autoLabelDays = true;
  let routingItemId: string | null = null;

  $: state = $itineraryStore;

  $: if (state.activeItinerary && (!draft || draft.id !== state.activeItinerary.id)) {
    draft = cloneValue(state.activeItinerary);
    if (!draft.baseCurrency) {
      draft.baseCurrency = 'CNY';
    }
    recalcBudget();
    dirty = false;
  }

  function cloneValue<T>(value: T): T {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function markDirty() {
    dirty = true;
  }

  function relabelDays(days: ItineraryDay[]): ItineraryDay[] {
    if (!autoLabelDays) return days;
    const autoPattern = /^第\d+天$/;
    return days.map((day, index) =>
      !day.label || autoPattern.test(day.label)
        ? { ...day, label: `第${index + 1}天` }
        : day
    );
  }

  type LocationEntity = 'transport-from' | 'transport-to' | 'stay' | 'activity';

  interface LocationRequestPayload {
    entity: LocationEntity;
    dayId: string;
    itemId: string;
    existing?: LocationPoint;
  }

  interface LocationAppliedDetail extends LocationRequestPayload {
    location: LocationPoint;
  }

  function openLocationPicker(payload: LocationRequestPayload) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<LocationRequestPayload>('youtinerary:location-request', { detail: payload }));
  }

  function mutateItem(dayId: string, itemId: string, mutator: (item: DayItem) => DayItem) {
    if (!draft) return;
    let changed = false;
    const updatedDays = relabelDays(
      draft.days.map((day) => {
        if (day.id !== dayId) return day;
        const items = day.items.map((entry) => {
          if (entry.id !== itemId) return entry;
          const originalSnapshot = JSON.stringify(entry);
          const next = mutator(cloneValue(entry));
          if (!changed && JSON.stringify(next) !== originalSnapshot) {
            changed = true;
          }
          return next;
        });
        return { ...day, items };
      })
    );
    if (!changed) return;
    draft = { ...draft, days: updatedDays };
    recalcBudget();
    markDirty();
  }

  function addItem(dayId: string, type: DayItemType) {
    if (!draft) return;
    const nextItem = createDayItem(type);
    draft = {
      ...draft,
      days: relabelDays(
        draft.days.map((day) => (day.id === dayId ? { ...day, items: [...day.items, nextItem] } : day))
      )
    };
    recalcBudget();
    markDirty();
  }

  function deleteItem(dayId: string, itemId: string) {
    if (!draft) return;
    draft = {
      ...draft,
      days: relabelDays(
        draft.days.map((day) =>
          day.id === dayId ? { ...day, items: day.items.filter((entry) => entry.id !== itemId) } : day
        )
      )
    };
    recalcBudget();
    markDirty();
  }

  function moveItem(dayId: string, itemId: string, direction: -1 | 1) {
    if (!draft) return;
    draft = {
      ...draft,
      days: relabelDays(
        draft.days.map((day) => {
          if (day.id !== dayId) return day;
          const index = day.items.findIndex((entry) => entry.id === itemId);
          if (index === -1) return day;
          const target = index + direction;
          if (target < 0 || target >= day.items.length) return day;
          const items = [...day.items];
          [items[index], items[target]] = [items[target], items[index]];
          return { ...day, items };
        })
      )
    };
    recalcBudget();
    markDirty();
  }

  function recalcBudget() {
    if (!draft) return;
    let transport = 0;
    let stay = 0;
    let activities = 0;
    draft.days.forEach((day) => {
      day.items.forEach((item) => {
        const amount =
          item.type === 'transport'
            ? item.transport.cost?.amount
            : item.type === 'stay'
              ? item.stay.cost?.amount
              : item.type === 'activity'
                ? item.activity.cost?.amount
                : undefined;
        if (amount && !Number.isNaN(amount)) {
          if (item.type === 'transport') transport += amount;
          if (item.type === 'stay') stay += amount;
          if (item.type === 'activity') activities += amount;
        }
      });
    });
    const others = draft.totalBudget?.others ?? 0;
    const currency = draft.baseCurrency ?? draft.totalBudget?.currency ?? 'CNY';
    draft = {
      ...draft,
      totalBudget: {
        transport,
        stay,
        activities,
        others,
        currency
      }
    };
  }

  function summarizeRoute(raw: unknown, mode: GaodeMode): string | null {
    if (!raw || typeof raw !== 'object' || !('raw' in (raw as Record<string, unknown>))) return null;
    const data = (raw as { raw: any }).raw;
    try {
      if (mode === 'transit') {
        const first = data?.route?.transits?.[0];
        if (!first) return null;
        const durationMin = Math.round(Number(first.duration) / 60);
        const walking = Number(first.walking_distance || 0);
        return `建议乘坐公共交通，耗时约 ${durationMin} 分钟，步行 ${Math.round(walking)} 米`;
      }
      const path = data?.route?.paths?.[0];
      if (!path) return null;
      const distanceKm = (Number(path.distance) / 1000).toFixed(1);
      const durationMin = Math.round(Number(path.duration) / 60);
      const tolls = path.tolls ? `；过路费约 ${path.tolls} 元` : '';
      return `高德推荐：约 ${distanceKm} 公里，耗时 ${durationMin} 分钟${tolls}`;
    } catch (error) {
      console.error('summarize route error', error);
      return null;
    }
  }

  type GaodeMode = 'driving' | 'transit' | 'walking' | 'bicycling';

  async function planRoute(dayId: string, item: TransportItem) {
    const segment = item.transport;
    if (!segment.fromLocation || !segment.toLocation) {
      alert('请先为出发地和到达地选择具体地点（需包含经纬度）。');
      return;
    }
    try {
      routingItemId = item.id;
      const mode = suggestGaodeMode(segment.mode ?? 'other');
      const params = new URLSearchParams({
        mode,
        origin: `${segment.fromLocation.lng},${segment.fromLocation.lat}`,
        destination: `${segment.toLocation.lng},${segment.toLocation.lat}`
      });
      const res = await fetch(`/api/gaode/route?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error('路线规划失败，请检查权限或稍后尝试。');
      }
      const data = await res.json();
      const summary = summarizeRoute(data, mode);
      if (summary) {
        mutateItem(dayId, item.id, (entry) => {
          if (entry.type !== 'transport') return entry;
          entry.transport.memo = summary + (entry.transport.memo ? `\n${entry.transport.memo}` : '');
          return entry;
        });
      }
    } catch (error) {
      alert((error as Error).message);
    } finally {
      routingItemId = null;
    }
  }

  function updateMeta<K extends keyof Itinerary>(key: K, value: Itinerary[K]) {
    if (!draft) return;
    draft = { ...draft, [key]: value };
    markDirty();
  }

  function updateDay(dayId: string, patch: Partial<ItineraryDay>) {
    if (!draft) return;
    draft = {
      ...draft,
      days: relabelDays(draft.days.map((day) => (day.id === dayId ? { ...day, ...patch } : day)))
    };
    markDirty();
  }

  function addDay() {
    if (!draft) return;
    const next = createEmptyDay(draft.days.length + 1);
    draft = { ...draft, days: relabelDays([...draft.days, next]) };
    recalcBudget();
    markDirty();
  }

  function duplicateDay(dayId: string) {
    if (!draft) return;
    const day = draft.days.find((item) => item.id === dayId);
    if (!day) return;
    const copy = cloneValue(day);
    copy.id = uid('day_');
    copy.label = `${day.label} - 复制`;
    draft = { ...draft, days: relabelDays([...draft.days, copy]) };
    recalcBudget();
    markDirty();
  }

  function deleteDay(dayId: string) {
    if (!draft) return;
    draft = { ...draft, days: relabelDays(draft.days.filter((day) => day.id !== dayId)) };
    recalcBudget();
    markDirty();
  }

  function reorderDay(dayId: string, direction: -1 | 1) {
    if (!draft) return;
    const index = draft.days.findIndex((day) => day.id === dayId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= draft.days.length) return;
    const days = [...draft.days];
    [days[index], days[target]] = [days[target], days[index]];
    draft = { ...draft, days: relabelDays(days) };
    recalcBudget();
    markDirty();
  }

  function applyLocation(detail: LocationAppliedDetail) {
    mutateItem(detail.dayId, detail.itemId, (entry) => {
      if (entry.type === 'transport') {
        if (detail.entity === 'transport-from') {
          entry.transport.from = detail.location.name;
          entry.transport.fromLocation = detail.location;
        } else if (detail.entity === 'transport-to') {
          entry.transport.to = detail.location.name;
          entry.transport.toLocation = detail.location;
        }
      }
      if (entry.type === 'stay' && detail.entity === 'stay') {
        entry.stay.name = detail.location.name;
        entry.stay.address = detail.location.address ?? entry.stay.address;
        entry.stay.location = detail.location;
      }
      if (entry.type === 'activity' && detail.entity === 'activity') {
        entry.activity.name = detail.location.name;
        entry.activity.address = detail.location.address ?? entry.activity.address;
        entry.activity.location = detail.location;
      }
      return entry;
    });
  }

  async function save() {
    if (!draft) return;
    const ok = await itineraryStore.persistItinerary(draft.id, draft);
    if (ok) {
      dirty = false;
    }
  }

  async function exportAsImage() {
    if (!draft) return;
    const element = document.getElementById('itinerary-export');
    if (!element) return;
    exporting = true;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(element, {
        backgroundColor: '#020617',
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
        useCORS: true
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${draft.slug || draft.id}.png`;
      link.click();
    } catch (error) {
      console.error(error);
      alert('导出失败，请稍后重试。');
    } finally {
      exporting = false;
    }
  }

  function copyItinerary() {
    if (!draft) return;
    const copy = cloneValue(draft);
    copy.id = '';
    copy.title = `${draft.title} - 复制`;
    copy.slug = `${draft.slug || draft.id}-copy`;
    itineraryStore.createDraft(copy);
  }

  function typeLabel(type: DayItemType): string {
    return getDayItemLabel(type);
  }

  onMount(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LocationAppliedDetail>).detail;
      if (!detail) return;
      applyLocation(detail);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('youtinerary:location-applied', handler as EventListener);
    }
    if (!state.list.length) {
      itineraryStore.loadList();
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('youtinerary:location-applied', handler as EventListener);
      }
    };
  });
</script>

{#if !draft}
  <div class="flex h-full min-h-[400px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-slate-500">
    <p class="text-base">请选择左侧的行程查看详情，或点击“新建行程”开始规划。</p>
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex flex-1 flex-col gap-4">
          <label class="flex flex-col gap-2 text-sm text-slate-600">
            行程标题
            <input
              class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              bind:value={draft.title}
              on:input={markDirty}
              placeholder="给行程起个名字吧"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm text-slate-600">
            行程别名（slug）
            <input
              class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              bind:value={draft.slug}
              on:input={markDirty}
              placeholder="my-next-trip"
            />
          </label>
          <label class="flex flex-col gap-2 text-sm text-slate-600">
            费用基准货币
            <select
              class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              bind:value={draft.baseCurrency}
              on:change={() => {
                markDirty();
                recalcBudget();
              }}
            >
              {#each currencyOptions as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-2 text-sm text-slate-600">
            行程概览
            <textarea
              class="min-h-[120px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              bind:value={draft.description}
              on:input={markDirty}
              placeholder="记录旅程亮点、同行伙伴或整体节奏。"
            />
          </label>
        </div>
        <div class="flex flex-shrink-0 flex-col gap-3 text-sm">
          <button
            class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-5 py-2 font-semibold text-white shadow-lg shadow-sky-200 hover:from-sky-400 hover:via-sky-300 hover:to-emerald-300 disabled:opacity-60"
            on:click={save}
            disabled={!dirty}
          >
            {dirty ? '保存行程' : '已保存'}
          </button>
          <button
            class="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-500 disabled:opacity-60"
            on:click={exportAsImage}
            disabled={exporting}
          >
            {exporting ? '导出中…' : '导出为图片'}
          </button>
          <button
            class="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-slate-500 hover:border-sky-300 hover:text-sky-500"
            on:click={copyItinerary}
          >
            复制行程
          </button>
        </div>
      </div>
    </div>

    <div
      id="itinerary-export"
      class="flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-xl shadow-sky-100"
    >
      <header class="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <h2 class="text-2xl font-semibold text-slate-800">{draft.title}</h2>
        {#if draft.description}
          <p class="text-sm text-slate-500">{draft.description}</p>
        {/if}
      </header>

      <section class="rounded-2xl border border-slate-200 bg-sky-50/60 p-4">
        <h3 class="text-lg font-semibold text-slate-700">费用概览</h3>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4">
            <span class="text-xs text-slate-500">交通</span>
            <span class="text-base font-semibold text-slate-700">{draft.totalBudget?.transport ?? 0}{draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY'}</span>
          </div>
          <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4">
            <span class="text-xs text-slate-500">住宿</span>
            <span class="text-base font-semibold text-slate-700">{draft.totalBudget?.stay ?? 0}{draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY'}</span>
          </div>
          <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4">
            <span class="text-xs text-slate-500">游玩</span>
            <span class="text-base font-semibold text-slate-700">{draft.totalBudget?.activities ?? 0}{draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY'}</span>
          </div>
          <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4">
            <span class="text-xs text-slate-500">其他</span>
            <span class="text-base font-semibold text-slate-700">{draft.totalBudget?.others ?? 0}{draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY'}</span>
          </div>
        </div>
      </section>

      {#each draft.days as day}
        <section class="rounded-2xl border border-slate-200 bg-slate-100 p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <input
                class="text-xl font-semibold text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                value={day.label}
                on:change={(event) => updateDay(day.id, { label: (event.target as HTMLInputElement).value })}
              />
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                <label class="flex items-center gap-2">
                  日期（可选）
                  <input
                    type="date"
                    class="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
                    value={day.date ?? ''}
                    on:change={(event) => updateDay(day.id, { date: (event.target as HTMLInputElement).value })}
                  />
                </label>
                <button
                  class="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                  on:click={() => duplicateDay(day.id)}
                >
                  复制当天
                </button>
                <button
                  class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-red-500/40 hover:text-red-200"
                  on:click={() => deleteDay(day.id)}
                >
                  删除当天
                </button>
                <div class="flex items-center gap-1">
                  <button
                    class="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                    on:click={() => reorderDay(day.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    class="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                    on:click={() => reorderDay(day.id, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            </div>
            <button
              class="self-start rounded-full border border-sky-400 px-3 py-1 text-xs text-sky-600 hover:bg-sky-100"
              on:click={() => (autoLabelDays = !autoLabelDays)}
            >
              {autoLabelDays ? '关闭自动标签' : '启用自动标签'}
            </button>
          </div>

          <div class="mt-4 flex flex-col gap-4">
            {#if day.items.length === 0}
              <p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">暂无安排，添加一条交通 / 住宿 / 游玩记录开始吧。</p>
            {/if}
            {#each day.items as entry, index}
              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-xs text-slate-500">
                    <span class="rounded-full border border-sky-200 px-2 py-0.5 text-sky-600">{typeLabel(entry.type)}</span>
                    <span class="text-slate-500">#{index + 1}</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <button
                      class="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-sky-300 hover:text-sky-500"
                      on:click={() => moveItem(day.id, entry.id, -1)}
                    >
                      上移
                    </button>
                    <button
                      class="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-sky-300 hover:text-sky-500"
                      on:click={() => moveItem(day.id, entry.id, 1)}
                    >
                      下移
                    </button>
                    <button
                      class="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-red-300 hover:text-red-400"
                      on:click={() => deleteItem(day.id, entry.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {#if entry.type === 'transport'}
                  <div class="mt-3 flex flex-col gap-3">
                    <div class="grid gap-3 sm:grid-cols-2">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        出发地
                        <div class="flex gap-2">
                          <input
                            class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            bind:value={entry.transport.from}
                            on:input={markDirty}
                          />
                          <button
                            type="button"
                            class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                            on:click={() =>
                              openLocationPicker({
                                entity: 'transport-from',
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.transport.fromLocation
                              })
                            }
                          >
                            选地点
                          </button>
                        </div>
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        到达地
                        <div class="flex gap-2">
                          <input
                            class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            bind:value={entry.transport.to}
                            on:input={markDirty}
                          />
                          <button
                            type="button"
                            class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                            on:click={() =>
                              openLocationPicker({
                                entity: 'transport-to',
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.transport.toLocation
                              })
                            }
                          >
                            选地点
                          </button>
                        </div>
                      </label>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-4">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        出发时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.transport.departTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        到达时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.transport.arriveTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        交通方式
                        <select
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.transport.mode}
                          on:change={markDirty}
                        >
                          {#each transportOptions as option}
                            <option value={option.value}>{option.label}</option>
                          {/each}
                        </select>
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        班次/路线
                        <input
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.transport.route}
                          on:input={markDirty}
                        />
                      </label>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-4">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用
                        <input
                          type="number"
                          min="0"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.transport.cost?.amount ?? ''}
                          on:input={(event) => {
                            const amount = Number((event.target as HTMLInputElement).value || 0);
                            const currency = entry.transport.cost?.currency ?? draft?.baseCurrency ?? 'CNY';
                            entry.transport.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用货币
                        <select
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.transport.cost?.currency ?? draft?.baseCurrency ?? 'CNY'}
                          on:change={(event) => {
                            const currency = (event.target as HTMLSelectElement).value;
                            const amount = entry.transport.cost?.amount ?? 0;
                            entry.transport.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        >
                          {#each currencyOptions as option}
                            <option value={option}>{option}</option>
                          {/each}
                        </select>
                      </label>
                      <div class="sm:col-span-2 flex items-center justify-end">
                        <button
                          class="rounded-full border border-sky-400 px-3 py-1 text-xs text-sky-600 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                          on:click={() => planRoute(day.id, entry)}
                          disabled={routingItemId === entry.id}
                        >
                          {routingItemId === entry.id ? '获取路线中…' : '高德路线建议'}
                        </button>
                      </div>
                    </div>
                    <label class="flex flex-col gap-1 text-xs text-slate-600">
                      备注
                      <textarea
                        class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        bind:value={entry.transport.memo}
                        rows={2}
                        on:input={markDirty}
                      />
                    </label>
                  </div>
                {:else if entry.type === 'stay'}
                  <div class="mt-3 flex flex-col gap-3">
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        住宿地点
                        <div class="flex gap-2">
                          <input
                            class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            bind:value={entry.stay.name}
                            on:input={markDirty}
                          />
                          <button
                            type="button"
                            class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                            on:click={() =>
                              openLocationPicker({
                                entity: 'stay',
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.stay.location
                              })
                            }
                          >
                            选地点
                          </button>
                        </div>
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        地址
                        <input
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.stay.address}
                          on:input={markDirty}
                        />
                      </label>
                    </div>
                    <div class="grid gap-3 md:grid-cols-3">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        入住时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.stay.checkInTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        退房时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.stay.checkOutTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用
                        <input
                          type="number"
                          min="0"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.stay.cost?.amount ?? ''}
                          on:input={(event) => {
                            const amount = Number((event.target as HTMLInputElement).value || 0);
                            const currency = entry.stay.cost?.currency ?? draft?.baseCurrency ?? 'CNY';
                            entry.stay.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        />
                      </label>
                    </div>
                    <label class="flex flex-col gap-1 text-xs text-slate-600">
                      备注
                      <textarea
                        class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        bind:value={entry.stay.memo}
                        rows={2}
                        on:input={markDirty}
                      />
                    </label>
                  </div>
                {:else if entry.type === 'activity'}
                  <div class="mt-3 flex flex-col gap-3">
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        游玩地点
                        <div class="flex gap-2">
                          <input
                            class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            bind:value={entry.activity.name}
                            on:input={markDirty}
                          />
                          <button
                            type="button"
                            class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                            on:click={() =>
                              openLocationPicker({
                                entity: 'activity',
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.activity.location
                              })
                            }
                          >
                            选地点
                          </button>
                        </div>
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        地址
                        <input
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.activity.address}
                          on:input={markDirty}
                        />
                      </label>
                    </div>
                    <div class="grid gap-3 md:grid-cols-3">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        开始时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.activity.startTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        结束时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.activity.endTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用
                        <input
                          type="number"
                          min="0"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.activity.cost?.amount ?? ''}
                          on:input={(event) => {
                            const amount = Number((event.target as HTMLInputElement).value || 0);
                            const currency = entry.activity.cost?.currency ?? draft?.baseCurrency ?? 'CNY';
                            entry.activity.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        />
                      </label>
                    </div>
                    <label class="flex flex-col gap-1 text-xs text-slate-600">
                      备注
                      <textarea
                        class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        bind:value={entry.activity.memo}
                        rows={2}
                        on:input={markDirty}
                      />
                    </label>
                  </div>
                {:else}
                  <label class="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                    备注内容
                    <textarea
                      class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      bind:value={entry.note.text}
                      rows={2}
                      on:input={markDirty}
                    />
                  </label>
                {/if}
              </div>
            {/each}

            <div class="flex flex-wrap gap-2">
              {#each DAY_ITEM_OPTIONS as option}
                <button
                  class="rounded-full border border-slate-300 px-4 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                  on:click={() => addItem(day.id, option.value)}
                >
                  添加{option.label}
                </button>
              {/each}
            </div>
          </div>
        </section>
      {/each}

      <button
        class="self-start rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-100"
        on:click={addDay}
      >
        添加新的一天
      </button>
    </div>
  </div>
{/if}
