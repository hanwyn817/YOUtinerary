<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchItinerariesFull } from '../../lib/api/client';
  import type { DayItem, DayItemType, Itinerary } from '../../lib/types';
import {
  getDayItemLabel,
  summarizeDayItem,
  summarizeTime,
  extractCostDisplay,
  getTransportModeLabel
} from '../../lib/utils/schedule';

  interface TableRow {
    id: string;
    dayLabel: string;
    date?: string;
    type: DayItemType;
    typeLabel: string;
    summary: string;
    time: string;
    cost: string;
    modeLabel?: string;
  }

  interface DayBucket {
    key: string;
    label: string;
    date?: string;
    rows: TableRow[];
  }

  interface ItineraryGroup {
    itinerary: Itinerary;
    tableRows: TableRow[];
    dayBuckets: DayBucket[];
  }

  let loading = true;
  let error: string | null = null;
  let itineraries: Itinerary[] = [];
  let groups: ItineraryGroup[] = [];

  onMount(async () => {
    try {
      itineraries = await fetchItinerariesFull();
      groups = buildGroups(itineraries);
    } catch (err) {
      error = (err as Error).message ?? '加载行程失败';
    } finally {
      loading = false;
    }
  });

  function buildGroups(list: Itinerary[]): ItineraryGroup[] {
    return list.map((itinerary) => {
      const baseCurrency = itinerary.baseCurrency ?? itinerary.totalBudget?.currency ?? 'CNY';
      const tableRows: TableRow[] = [];
      const dayBuckets: DayBucket[] = [];

      if (!itinerary.days?.length) {
        const placeholder: TableRow = {
          id: `${itinerary.id}-overview`,
          dayLabel: '行程概览',
          date: undefined,
          type: 'note',
          typeLabel: getDayItemLabel('note'),
          summary: itinerary.description?.trim() || '（暂无具体安排）',
          time: '',
          cost: ''
        };
        tableRows.push(placeholder);
        dayBuckets.push({
          key: `${itinerary.id}-overview`,
          label: '行程概览',
          rows: [placeholder]
        });
      } else {
        for (const day of itinerary.days) {
          const bucketRows: TableRow[] = [];
          const items = day.items && day.items.length > 0 ? day.items : [createPlaceholderNote()];
          items.forEach((item, index) => {
            const itemId = item.id ?? `item-${index}`;
            const row: TableRow = {
              id: `${itinerary.id}-${day.id}-${itemId}`,
              dayLabel: day.label,
              date: day.date,
              type: item.type,
              typeLabel: getDayItemLabel(item.type),
              summary: summarizeDayItem(item),
              time: extractTime(item),
              cost: extractCostDisplay(item, baseCurrency),
              modeLabel: item.type === 'transport' ? getTransportModeLabel(item.transport.mode) : undefined
            };
            tableRows.push(row);
            bucketRows.push(row);
          });
          dayBuckets.push({
            key: `${itinerary.id}-${day.id}`,
            label: day.label,
            date: day.date,
            rows: bucketRows
          });
        }
      }

      return { itinerary, tableRows, dayBuckets };
    });
  }

  function createPlaceholderNote(): DayItem {
    const suffix = Math.random().toString(36).slice(2, 8);
    return { id: `placeholder-${suffix}`, type: 'note', note: { id: `note-${suffix}`, text: '（暂无安排）' } };
  }

  function extractTime(item: DayItem): string {
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
</script>

<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h2 class="text-xl font-semibold text-slate-800">行程总览</h2>
      <p class="text-sm text-slate-500">纵览所有行程的每日安排，快速了解节奏与重点。</p>
    </div>
    <div class="flex flex-wrap gap-3">
      <a
        href="/itinerary/new"
        class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 hover:from-sky-400 hover:via-sky-300 hover:to-emerald-300"
      >
        新建行程
      </a>
    </div>
  </div>

  {#if loading}
    <div class="mt-6 flex items-center justify-center rounded-2xl border border-slate-200 bg-sky-50 py-12 text-sm text-slate-500">
      正在加载行程...
    </div>
  {:else if error}
    <div class="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
      {error}
    </div>
  {:else if groups.length === 0}
    <div class="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-sm text-slate-500">
      <p>还没有行程安排，点击右上角的“新建行程”开始规划旅程。</p>
    </div>
  {:else}
    <div class="mt-6 flex flex-col gap-6">
      {#each groups as group (group.itinerary.id)}
        <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100">
          <header class="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex flex-col gap-2">
              <h3 class="text-lg font-semibold text-slate-800">{group.itinerary.title}</h3>
              {#if group.itinerary.description}
                <p class="text-sm text-slate-600">{group.itinerary.description}</p>
              {/if}
              <span class="text-xs text-slate-400">更新于 {new Date(group.itinerary.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
            <a
              href={`/itinerary/${group.itinerary.id}`}
              class="inline-flex items-center justify-center rounded-full border border-sky-400 px-4 py-2 text-xs font-semibold text-sky-600 hover:bg-sky-50"
            >
              编辑行程
            </a>
          </header>

          <div class="mt-4 flex flex-col gap-4 md:hidden">
            {#each group.dayBuckets as bucket (bucket.key)}
              <div class="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 shadow-inner shadow-slate-100">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex flex-col gap-1">
                    <span class="text-sm font-semibold text-slate-800">{bucket.label || '未命名日程'}</span>
                    {#if bucket.date}
                      <span class="text-xs text-slate-500">{bucket.date}</span>
                    {/if}
                  </div>
                  <a
                    href={`/itinerary/${group.itinerary.id}`}
                    class="inline-flex items-center justify-center rounded-full border border-sky-300 px-3 py-1 text-xs text-sky-600 hover:border-sky-400 hover:text-sky-500"
                  >
                    查看详情
                  </a>
                </div>
                <div class="mt-4 flex flex-col gap-3">
                  {#if bucket.rows.length === 0}
                    <div class="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-xs text-slate-500">
                      这一天还没有安排。
                    </div>
                  {:else}
                    {#each bucket.rows as row (row.id)}
                      <div class="relative pl-5">
                        <span class="absolute left-1 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-400"></span>
                        <div class="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                            <span>{row.time || '时间未定'}</span>
                            {#if row.cost}
                              <span class="text-sky-600">{row.cost}</span>
                            {/if}
                          </div>
                          <p class="mt-2 text-sm font-medium text-slate-700">{row.summary}</p>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <span class="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-600">{row.typeLabel}</span>
                            {#if row.modeLabel}
                              <span class="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-600">{row.modeLabel}</span>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="mt-4 hidden overflow-x-auto md:block">
            <table class="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
              <thead class="bg-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="px-4 py-3">日程</th>
                  <th class="px-4 py-3">时间</th>
                  <th class="px-4 py-3">类型</th>
                  <th class="px-4 py-3">详情</th>
                  <th class="px-4 py-3">费用</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                {#each group.tableRows as row (row.id)}
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 align-top">
                      <div class="flex flex-col gap-1">
                        <span class="font-medium text-slate-800">{row.dayLabel}</span>
                        {#if row.date}
                          <span class="text-xs text-slate-500">{row.date}</span>
                        {/if}
                      </div>
                    </td>
                    <td class="px-4 py-3 align-top text-slate-600">
                      {row.time || '—'}
                    </td>
                    <td class="px-4 py-3 align-top">
                      <div class="inline-flex items-center gap-2">
                        <span class="inline-flex rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500">{row.typeLabel}</span>
                        {#if row.modeLabel}
                          <span class="text-xs text-slate-500">{row.modeLabel}</span>
                        {/if}
                      </div>
                    </td>
                    <td class="px-4 py-3 align-top">
                      <span class="text-slate-700">{row.summary}</span>
                    </td>
                    <td class="px-4 py-3 align-top">
                      {#if row.cost}
                        <span class="text-sky-600">{row.cost}</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
