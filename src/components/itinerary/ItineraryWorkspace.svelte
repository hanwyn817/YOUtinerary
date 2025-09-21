<script lang="ts">
import { onMount, tick } from 'svelte';
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
import {
  DAY_ITEM_OPTIONS,
  extractCostDisplay,
  getDayItemLabel,
  getTransportModeLabel,
  summarizeDayItem,
  summarizeTime,
  suggestGaodeMode
} from '../../lib/utils/schedule';

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
  let previewMode = false;
  let exportLayoutVisible = false;
  let exportQrDataUrl = '';
  let exportPageUrl = '';
  let confirmingDelete = false;
  let deleting = false;
  let deleteError: string | null = null;

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

  function openDeleteConfirm() {
    deleteError = null;
    confirmingDelete = true;
  }

  function closeDeleteConfirm() {
    if (deleting) return;
    confirmingDelete = false;
    deleteError = null;
  }

  async function handleDelete() {
    if (!draft || deleting) return;
    deleting = true;
    deleteError = null;
    const ok = await itineraryStore.removeItinerary(draft.id);
    deleting = false;
    if (ok) {
      confirmingDelete = false;
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } else {
      deleteError = state.error ?? '删除失败，请稍后重试。';
    }
  }

  async function exportAsImage() {
    if (!draft) return;
    exporting = true;
    try {
      const [{ default: html2canvas }, qrModule] = await Promise.all([
        import('html2canvas'),
        import('qrcode')
      ]);

      const QRCode = (qrModule as any).default ?? qrModule;
      if (!QRCode?.toDataURL) {
        throw new Error('二维码模块加载失败');
      }

      const itineraryUrl = new URL(`/itinerary/${draft.id}`, window.location.origin).toString();
      exportPageUrl = itineraryUrl;
      exportQrDataUrl = await QRCode.toDataURL(itineraryUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      exportLayoutVisible = true;
      await tick();

      const element = document.getElementById('itinerary-export-sheet');
      if (!element) {
        throw new Error('未找到导出容器');
      }

      const canvas = await html2canvas(element, {
        backgroundColor: '#0f172a',
        scale: Math.min(window.devicePixelRatio || 2, 3),
        useCORS: true,
        onclone: (clonedDocument) => {
          clonedDocument.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
            node.remove();
          });
          clonedDocument.body.style.background = '#020617';
          clonedDocument.body.style.color = '#e2e8f0';
        }
      });

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${draft.slug || draft.id}.png`;
      link.click();
    } catch (error) {
      console.error(error);
      alert('导出失败，请稍后重试。');
    } finally {
      exportLayoutVisible = false;
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

  function timelineTime(item: DayItem): string {
    switch (item.type) {
      case 'transport':
        return summarizeTime(item.transport.departTime, item.transport.arriveTime, ' → ');
      case 'stay':
        return summarizeTime(item.stay.checkInTime, item.stay.checkOutTime, ' - ');
      case 'activity':
        return summarizeTime(item.activity.startTime, item.activity.endTime, ' - ');
      default:
        return '';
    }
  }

  function timelineCost(item: DayItem): string {
    const currency = draft?.baseCurrency ?? draft?.totalBudget?.currency ?? 'CNY';
    return extractCostDisplay(item, currency);
  }

  function timelineSummary(item: DayItem): string {
    return summarizeDayItem(item);
  }

  function timelineMode(item: DayItem): string | null {
    if (item.type !== 'transport') return null;
    return getTransportModeLabel(item.transport.mode);
  }

  function timelineNotes(item: DayItem): string[] {
    if (item.type === 'transport') {
      return [item.transport.memo?.trim()].filter(Boolean) as string[];
    }
    if (item.type === 'stay') {
      return [item.stay.memo?.trim()].filter(Boolean) as string[];
    }
    if (item.type === 'activity') {
      return [item.activity.memo?.trim()].filter(Boolean) as string[];
    }
    return [];
  }

  function dayCost(day: ItineraryDay): number {
    return day.items.reduce((total, item) => {
      const amount =
        item.type === 'transport'
          ? item.transport.cost?.amount
          : item.type === 'stay'
            ? item.stay.cost?.amount
            : item.type === 'activity'
              ? item.activity.cost?.amount
              : undefined;
      if (!amount || Number.isNaN(amount)) return total;
      return total + amount;
    }, 0);
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
            class="inline-flex items-center justify-center rounded-full border border-sky-300 px-5 py-2 font-semibold text-sky-600 hover:border-sky-400 hover:text-sky-500"
            on:click={() => (previewMode = !previewMode)}
          >
            {previewMode ? '返回编辑模式' : '行程预览'}
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
          <button
            class="inline-flex items-center justify-center rounded-full border border-red-200 px-5 py-2 font-semibold text-red-500 hover:border-red-300 hover:text-red-600 disabled:opacity-60"
            on:click={openDeleteConfirm}
            disabled={!state.editingUnlocked || deleting}
          >
            删除行程
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

      {#if previewMode}
        <div class="flex flex-col gap-5">
          {#each draft.days as day, dayIndex}
            <article class="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-inner shadow-slate-100">
              <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex flex-col gap-1">
                  <h3 class="text-lg font-semibold text-slate-800">{day.label || `第${dayIndex + 1}天`}</h3>
                  {#if day.date}
                    <span class="text-xs text-slate-500">{day.date}</span>
                  {/if}
                </div>
                {#if dayCost(day) > 0}
                  <span class="inline-flex items-center rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs text-sky-600">
                    预计费用 {dayCost(day)}{draft.baseCurrency ?? draft.totalBudget?.currency ?? 'CNY'}
                  </span>
                {/if}
              </header>
              <div class="mt-4 flex flex-col gap-4">
                {#if day.items.length === 0}
                  <div class="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
                    这一天暂未安排。
                  </div>
                {:else}
                  {#each day.items as entry, index}
                    <div class="relative pl-9">
                      <span class="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold text-white">{index + 1}</span>
                      <div class="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{timelineTime(entry) || '时间未定'}</span>
                          {#if timelineCost(entry)}
                            <span class="text-sky-600">{timelineCost(entry)}</span>
                          {/if}
                        </div>
                        <p class="mt-2 text-sm font-semibold text-slate-800">{timelineSummary(entry)}</p>
                        <div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span class="rounded-full bg-sky-100 px-2 py-1 text-sky-600">{typeLabel(entry.type)}</span>
                          {#if timelineMode(entry)}
                            <span class="rounded-full bg-emerald-100 px-2 py-1 text-emerald-600">{timelineMode(entry)}</span>
                          {/if}
                        </div>
                        {#if timelineNotes(entry).length}
                          {#each timelineNotes(entry) as note, noteIndex}
                            <p class="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">{note}</p>
                          {/each}
                        {/if}
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        {#each draft.days as day, dayIndex}
          <section class="rounded-2xl border border-slate-200 bg-slate-100/80 p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <input
                  class="text-xl font-semibold text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  value={day.label}
                  on:change={(event) => updateDay(day.id, { label: (event.target as HTMLInputElement).value })}
                  placeholder={`第${dayIndex + 1}天`}
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
                    class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-red-500/40 hover:text-red-400"
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
              <div class="flex items-center gap-2">
                {#if dayCost(day) > 0}
                  <span class="rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs text-sky-600">
                    预计费用 {dayCost(day)}{draft.baseCurrency ?? draft.totalBudget?.currency ?? 'CNY'}
                  </span>
                {/if}
                <button
                  class="rounded-full border border-sky-400 px-3 py-1 text-xs text-sky-600 hover:bg-sky-100"
                  on:click={() => (autoLabelDays = !autoLabelDays)}
                >
                  {autoLabelDays ? '关闭自动标签' : '启用自动标签'}
                </button>
              </div>
            </div>

            <div class="mt-4 md:hidden">
              <div class="rounded-2xl border border-sky-100 bg-white/80 p-3">
                <h4 class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">今日概览</h4>
                <div class="mt-3 flex flex-col gap-3">
                  {#if day.items.length === 0}
                    <p class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">暂无安排</p>
                  {:else}
                    {#each day.items as entry, index}
                      <div class="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                        <div class="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{timelineTime(entry) || `#${index + 1}`}</span>
                          {#if timelineCost(entry)}
                            <span class="text-sky-600">{timelineCost(entry)}</span>
                          {/if}
                        </div>
                        <p class="mt-1 text-sm font-semibold text-slate-700">{timelineSummary(entry)}</p>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
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

      {/if}

      <button
        class="self-start rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-100"
        on:click={addDay}
      >
        添加新的一天
      </button>
    </div>
  </div>
{/if}

{#if exportLayoutVisible && draft}
  <div style="position: fixed; left: -9999px; top: 0; width: 0; height: 0; overflow: visible;">
    <div
      id="itinerary-export-sheet"
      style="all: initial; display: block; width: 720px; margin: 0 auto; overflow: hidden; border-radius: 28px; padding: 36px; background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%); color: #0f172a; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box;"
    >
      <header style="display: flex; flex-direction: column; gap: 20px; border-bottom: 1px solid #dbe3f0; padding-bottom: 28px;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <span style="display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; background: rgba(14, 116, 144, 0.12); color: #0e7490; width: fit-content;">
            YOUtinerary · 灵感随行
          </span>
          <h1 style="margin: 0; font-size: 36px; font-weight: 600; line-height: 1.2; color: #0f172a;">{draft.title}</h1>
          {#if draft.description}
            <p style="margin: 0; font-size: 16px; color: #475569; line-height: 1.7;">{draft.description}</p>
          {/if}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 18px; font-size: 14px; color: #64748b;">
          <span>更新于 {new Date(draft.updatedAt ?? draft.createdAt ?? Date.now()).toLocaleString('zh-CN')}</span>
          <span>行程天数：{draft.days.length}</span>
          <span>基准货币：{draft.baseCurrency ?? 'CNY'}</span>
        </div>
      </header>

      {#each draft.days as day, dayIndex}
        <section style="margin-top: 28px; border-radius: 26px; border: 1px solid #dbe3f0; background: rgba(255, 255, 255, 0.9); padding: 28px; box-shadow: 0 18px 40px rgba(100, 116, 139, 0.08);">
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <h2 style="margin: 0; font-size: 24px; font-weight: 600; color: #0f172a;">{day.label || `第${dayIndex + 1}天`}</h2>
              {#if day.date}
                <span style="font-size: 14px; color: #64748b;">{day.date}</span>
              {/if}
            </div>
            {#if dayCost(day) > 0}
              <span style="display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 14px; font-size: 13px; border: 1px solid rgba(14, 116, 144, 0.2); background: rgba(186, 230, 253, 0.35); color: #0e7490; width: fit-content;">
                当日预算 {dayCost(day)}{draft.baseCurrency ?? draft.totalBudget?.currency ?? 'CNY'}
              </span>
            {/if}
          </div>

          <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 20px;">
            {#if day.items.length === 0}
              <div style="border-radius: 20px; border: 1px dashed rgba(148, 163, 184, 0.4); background: rgba(226, 232, 240, 0.5); padding: 28px; text-align: center; font-size: 15px; color: #475569;">
                这一天暂未安排。
              </div>
            {:else}
              {#each day.items as entry, index}
                <div style="display: flex; gap: 20px;">
                  <div style="display: flex; flex-direction: column; align-items: center;">
                    <span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 16px; font-size: 13px; font-weight: 600; background: rgba(14, 116, 144, 0.15); color: #0e7490;">
                      {index + 1}
                    </span>
                    {#if index < day.items.length - 1}
                      <span style="margin-top: 4px; flex: 1; width: 1px; background: rgba(148, 163, 184, 0.4);"></span>
                    {/if}
                  </div>
                  <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; border-radius: 20px; border: 1px solid #dbe3f0; background: rgba(255, 255, 255, 0.95); padding: 20px;">
                    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; font-size: 14px; color: #64748b;">
                      <span>{timelineTime(entry) || '时间未定'}</span>
                      {#if timelineCost(entry)}
                        <span style="color: #0f766e; font-weight: 600;">{timelineCost(entry)}</span>
                      {/if}
                    </div>
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #0f172a; line-height: 1.5;">{timelineSummary(entry)}</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px;">
                      <span style="border-radius: 999px; padding: 5px 10px; background: rgba(2, 132, 199, 0.15); color: #0c4a6e;">{typeLabel(entry.type)}</span>
                      {#if timelineMode(entry)}
                        <span style="border-radius: 999px; padding: 5px 10px; background: rgba(22, 163, 74, 0.18); color: #166534;">{timelineMode(entry)}</span>
                      {/if}
                    </div>
                    {#if timelineNotes(entry).length}
                      {#each timelineNotes(entry) as note}
                        <p style="margin: 0; border-radius: 16px; background: rgba(226, 232, 240, 0.65); padding: 14px; font-size: 13px; line-height: 1.8; color: #475569;">{note}</p>
                      {/each}
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>
      {/each}

      <footer style="margin-top: 36px; border-radius: 24px; border: 1px solid #e2e8f0; background: #ffffff; padding: 28px; color: #1f2937; box-shadow: 0 18px 40px rgba(100, 116, 139, 0.08);">
        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #0f172a;">继续在线编辑</h3>
        <p style="margin: 6px 0 0; font-size: 15px; color: #475569;">扫描二维码即可回到行程编辑页面，随时更新计划。</p>
        <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 14px;">
          {#if exportQrDataUrl}
            <img
              src={exportQrDataUrl}
              alt="行程二维码"
              style="width: 120px; height: 120px; border-radius: 18px; border: 1px solid #e2e8f0; background: #ffffff; padding: 10px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);"
            />
          {/if}
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #475569;">
            <span style="font-weight: 600; color: #0f172a;">行程链接</span>
            <span style="word-break: break-all; line-height: 1.6;">{exportPageUrl}</span>
          </div>
        </div>
      </footer>
    </div>
  </div>
{/if}

{#if confirmingDelete}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
    <div class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
      <h3 class="text-lg font-semibold text-slate-900">确认删除行程</h3>
      <p class="mt-3 text-sm text-slate-600">
        确定要删除当前行程吗？删除后无法恢复，所有安排与备注都会被清除。
      </p>
      {#if deleteError}
        <p class="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{deleteError}</p>
      {/if}
      <div class="mt-6 flex justify-end gap-3 text-sm">
        <button
          class="rounded-full border border-slate-200 px-4 py-2 text-slate-600 hover:border-slate-300 hover:text-slate-700"
          on:click={closeDeleteConfirm}
          disabled={deleting}
        >
          取消
        </button>
        <button
          class="rounded-full border border-red-200 bg-red-500 px-4 py-2 font-semibold text-white shadow hover:bg-red-400 disabled:opacity-60"
          on:click={handleDelete}
          disabled={deleting}
        >
          {deleting ? '删除中…' : '确认删除'}
        </button>
      </div>
    </div>
  </div>
{/if}
