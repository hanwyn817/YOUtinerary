<script lang="ts">
  import type { TableRow } from "./types";
  import DayItemSummary from "../itinerary/DayItemSummary.svelte";

  export let tableRows: TableRow[];
</script>

<div class="mt-4 hidden overflow-x-auto md:block">
  <table
    class="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700"
  >
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
      {#each tableRows as row (row.id)}
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
            {row.time || "—"}
          </td>
          <td class="px-4 py-3 align-top">
            <div class="inline-flex items-center gap-2">
              <span
                class="inline-flex rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500"
                >{row.typeLabel}</span
              >
              {#if row.modeLabel}
                <span class="text-xs text-slate-500">{row.modeLabel}</span>
              {/if}
            </div>
          </td>
          <td class="px-4 py-3 align-top">
            <div class="text-slate-700">
              <DayItemSummary item={row.item} />
            </div>
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
