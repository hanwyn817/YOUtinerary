<script lang="ts">
  import { slide } from "svelte/transition";
  import type { DayBucket } from "./types";
  import DayItemSummary from "../itinerary/DayItemSummary.svelte";

  export let itineraryId: string;
  export let dayBuckets: DayBucket[];
  export let isItineraryExpanded: boolean;

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();
</script>

<div class="mt-4 md:hidden">
  <button
    type="button"
    class="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner shadow-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    on:click={() => dispatch("toggle")}
    aria-expanded={isItineraryExpanded}
    aria-controls={`mobile-itinerary-${itineraryId}`}
  >
    <span>{isItineraryExpanded ? "收起行程" : "展开行程"}</span>
    <svg
      class={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
        isItineraryExpanded ? "rotate-180" : ""
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clip-rule="evenodd"
      />
    </svg>
  </button>
</div>

{#if isItineraryExpanded}
  <div
    id={`mobile-itinerary-${itineraryId}`}
    class="mt-3 flex flex-col gap-4 md:hidden"
    transition:slide={{ duration: 300 }}
  >
    {#each dayBuckets as bucket (bucket.key)}
      <div
        class="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 shadow-inner shadow-slate-100"
      >
        <div class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-slate-800"
            >{bucket.label || "未命名日程"}</span
          >
          {#if bucket.date}
            <span class="text-xs text-slate-500">{bucket.date}</span>
          {/if}
        </div>

        <div class="mt-3 flex flex-col gap-2">
          {#if bucket.rows.length === 0}
            <div
              class="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-xs text-slate-500"
            >
              这一天还没有安排。
            </div>
          {:else}
            {#each bucket.rows as row (row.id)}
              <div class="relative pl-4">
                <span
                  class="absolute left-1 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-400"
                ></span>
                <div
                  class="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm"
                >
                  <div
                    class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <span>{row.time || "时间未定"}</span>
                      <span
                        class="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-600"
                        >{row.typeLabel}</span
                      >
                      {#if row.modeLabel}
                        <span
                          class="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-600"
                          >{row.modeLabel}</span
                        >
                      {/if}
                    </div>
                    {#if row.cost}
                      <span class="text-sky-600">{row.cost}</span>
                    {/if}
                  </div>
                  <div class="mt-1.5 text-sm font-medium text-slate-700">
                    <DayItemSummary item={row.item} />
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
