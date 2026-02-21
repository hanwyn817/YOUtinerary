<script lang="ts">
  import { onMount } from "svelte";
  import { fetchItinerariesFull, createItinerary } from "../../lib/api/client";
  import type { DayItem, DayItemType, Itinerary } from "../../lib/types";
  import {
    getDayItemLabel,
    summarizeDayItem,
    summarizeTime,
    extractCostDisplay,
    getTransportModeLabel,
  } from "../../lib/utils/schedule";

  import type { TableRow, DayBucket } from "./types";
  import DesktopItineraryTable from "./DesktopItineraryTable.svelte";
  import MobileItineraryList from "./MobileItineraryList.svelte";

  interface ItineraryGroup {
    itinerary: Itinerary;
    tableRows: TableRow[];
    dayBuckets: DayBucket[];
  }

  let loading = true;
  let error: string | null = null;
  let itineraries: Itinerary[] = [];
  let groups: ItineraryGroup[] = [];
  let collapsedBuckets: Set<string> = new Set();
  let mobileExpanded: Record<string, boolean> = {};

  onMount(async () => {
    try {
      itineraries = await fetchItinerariesFull();
      groups = buildGroups(itineraries);
      collapsedBuckets = collectAllBucketKeys(groups);
      mobileExpanded = {};
    } catch (err) {
      error = (err as Error).message ?? "加载行程失败";
    } finally {
      loading = false;
    }
  });

  async function exportAllAsJson() {
    try {
      const dataStr = JSON.stringify(itineraries, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `youtinerary-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export JSON:", err);
      alert("导出备份失败，请检查控制台。");
    }
  }

  let fileInput: HTMLInputElement;

  async function importFromJson(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let itemsToImport: Partial<Itinerary>[] = [];

      if (Array.isArray(parsed)) {
        itemsToImport = parsed;
      } else if (typeof parsed === "object" && parsed !== null) {
        itemsToImport = [parsed];
      } else {
        throw new Error("Invalid JSON format");
      }

      if (itemsToImport.length === 0) {
        alert("文件中没有找到行程数据。");
        return;
      }

      const confirmed = confirm(
        `在文件中找到 ${itemsToImport.length} 个行程，确认导入吗？此操作会创建新的行程草稿。`,
      );
      if (!confirmed) {
        if (fileInput) fileInput.value = "";
        return;
      }

      loading = true;
      let successCount = 0;
      let failCount = 0;

      for (const item of itemsToImport) {
        try {
          const payload = { ...item };
          delete payload.id; // Ensure we create new items
          await createItinerary(payload);
          successCount++;
        } catch (err) {
          console.error("Failed to import itinerary:", err);
          failCount++;
        }
      }

      alert(`导入完成！\n成功: ${successCount}\n失败: ${failCount}`);

      // Reload list
      itineraries = await fetchItinerariesFull();
      groups = buildGroups(itineraries);
      collapsedBuckets = collectAllBucketKeys(groups);
    } catch (err) {
      console.error("Failed to parse or import JSON:", err);
      alert("导入失败，文件格式可能不正确。");
    } finally {
      if (fileInput) fileInput.value = "";
      loading = false;
    }
  }

  function triggerFileInput() {
    if (fileInput) {
      fileInput.click();
    }
  }

  function buildGroups(list: Itinerary[]): ItineraryGroup[] {
    return list.map((itinerary) => {
      const baseCurrency =
        itinerary.baseCurrency ?? itinerary.totalBudget?.currency ?? "CNY";
      const tableRows: TableRow[] = [];
      const dayBuckets: DayBucket[] = [];

      if (!itinerary.days?.length) {
        const placeholder: TableRow = {
          id: `${itinerary.id}-overview`,
          dayLabel: "行程概览",
          date: undefined,
          type: "note",
          typeLabel: getDayItemLabel("note"),
          summary: itinerary.description?.trim() || "（暂无具体安排）",
          item: {
            id: "empty",
            type: "note",
            note: {
              id: "empty",
              text: itinerary.description?.trim() || "（暂无具体安排）",
            },
          } as DayItem,
          time: "",
          cost: "",
        };
        tableRows.push(placeholder);
        dayBuckets.push({
          key: `${itinerary.id}-overview`,
          label: "行程概览",
          rows: [placeholder],
        });
      } else {
        for (const day of itinerary.days) {
          const bucketRows: TableRow[] = [];
          const items =
            day.items && day.items.length > 0
              ? day.items
              : [createPlaceholderNote()];
          items.forEach((item, index) => {
            const itemId = item.id ?? `item-${index}`;
            const row: TableRow = {
              id: `${itinerary.id}-${day.id}-${itemId}`,
              dayLabel: day.label,
              date: day.date,
              type: item.type,
              typeLabel: getDayItemLabel(item.type),
              summary: summarizeDayItem(item),
              item,
              time: extractTime(item),
              cost: extractCostDisplay(item, baseCurrency),
              modeLabel:
                item.type === "transport"
                  ? getTransportModeLabel(item.transport.mode)
                  : undefined,
            };
            tableRows.push(row);
            bucketRows.push(row);
          });
          dayBuckets.push({
            key: `${itinerary.id}-${day.id}`,
            label: day.label,
            date: day.date,
            rows: bucketRows,
          });
        }
      }

      return { itinerary, tableRows, dayBuckets };
    });
  }

  function createPlaceholderNote(): DayItem {
    const suffix = Math.random().toString(36).slice(2, 8);
    return {
      id: `placeholder-${suffix}`,
      type: "note",
      note: { id: `note-${suffix}`, text: "（暂无安排）" },
    };
  }

  function collectAllBucketKeys(list: ItineraryGroup[]): Set<string> {
    const keys = new Set<string>();
    for (const group of list) {
      for (const bucket of group.dayBuckets) {
        keys.add(bucket.key);
      }
    }
    return keys;
  }

  function extractTime(item: DayItem): string {
    switch (item.type) {
      case "transport":
        return summarizeTime(
          item.transport.departTime,
          item.transport.arriveTime,
          " → ",
        );
      case "stay":
        return summarizeTime(
          item.stay.checkInTime,
          item.stay.checkOutTime,
          " - ",
        );
      case "activity":
        return summarizeTime(
          item.activity.startTime,
          item.activity.endTime,
          " - ",
        );
      case "meal":
        return summarizeTime(item.meal.startTime, item.meal.endTime, " - ");
      case "shopping":
        return summarizeTime(
          item.shopping.startTime,
          item.shopping.endTime,
          " - ",
        );
      default:
        return "";
    }
  }

  function toggleBucket(id: string) {
    const next = new Set(collapsedBuckets);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    collapsedBuckets = next;
  }

  function isBucketCollapsed(id: string): boolean {
    return collapsedBuckets.has(id);
  }

  function setBucketsStateForItinerary(
    itineraryId: string,
    shouldCollapse: boolean,
  ) {
    const targetGroup = groups.find(
      (group) => group.itinerary.id === itineraryId,
    );
    if (!targetGroup) return;
    const next = new Set(collapsedBuckets);
    for (const bucket of targetGroup.dayBuckets) {
      if (shouldCollapse) {
        next.add(bucket.key);
      } else {
        next.delete(bucket.key);
      }
    }
    collapsedBuckets = next;
  }

  function toggleMobileItinerary(itineraryId: string) {
    const currentlyExpanded = mobileExpanded[itineraryId] ?? false;
    const nextExpanded = {
      ...mobileExpanded,
      [itineraryId]: !currentlyExpanded,
    };
    if (!nextExpanded[itineraryId]) {
      delete nextExpanded[itineraryId];
    }
    mobileExpanded = nextExpanded;

    if (mobileExpanded[itineraryId]) {
      setBucketsStateForItinerary(itineraryId, false);
    } else {
      setBucketsStateForItinerary(itineraryId, true);
    }
  }
</script>

<section class="flex flex-col gap-6">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h2 class="text-xl font-bold text-slate-800">全部行程</h2>
    <div class="flex items-center gap-3">
      <button
        class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-500"
        on:click={exportAllAsJson}
        title="备份所有行程数据"
      >
        导出全部 (备份)
      </button>
      <button
        class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-500"
        on:click={triggerFileInput}
        title="从 JSON 文件恢复数据"
      >
        导入数据 (还原)
      </button>
      <input
        type="file"
        accept="application/json"
        class="hidden"
        bind:this={fileInput}
        on:change={importFromJson}
      />
    </div>
  </div>

  {#if loading}
    <div
      class="flex items-center justify-center rounded-3xl border border-slate-200 bg-sky-50 py-12 text-sm text-slate-500"
    >
      正在加载行程...
    </div>
  {:else if error}
    <div
      class="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
    >
      {error}
    </div>
  {:else if groups.length === 0}
    <div
      class="flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-sky-200 bg-white/50 py-16 text-center shadow-sm"
    >
      <div
        class="flex h-20 w-20 items-center justify-center rounded-full bg-sky-50"
      >
        <svg
          class="h-10 w-10 text-sky-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <div class="flex flex-col gap-1">
        <h3 class="text-lg font-medium text-slate-800">暂无行程安排</h3>
        <p class="text-sm text-slate-500">
          你还没有创建任何行程，快来规划你的下一次旅行吧！
        </p>
      </div>
      <a
        href="/itinerary/new"
        class="mt-2 inline-flex items-center justify-center rounded-full bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-200 transition hover:bg-sky-400"
      >
        开启新旅程
      </a>
    </div>
  {:else}
    <div class="grid gap-6">
      {#each groups as group (group.itinerary.id)}
        {@const isItineraryExpanded =
          mobileExpanded[group.itinerary.id] ?? false}
        <article
          class="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100"
        >
          <header
            class="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-semibold text-slate-800">
                  {group.itinerary.title}
                </h3>
                <span class="text-xs text-slate-400"
                  >更新于 {new Date(group.itinerary.updatedAt).toLocaleString(
                    "zh-CN",
                  )}</span
                >
              </div>
              {#if group.itinerary.description}
                <p class="text-sm text-slate-600">
                  {group.itinerary.description}
                </p>
              {/if}
            </div>
            <a
              href={`/itinerary/${group.itinerary.id}`}
              class="inline-flex items-center justify-center rounded-full border border-sky-400 px-4 py-2 text-xs font-semibold text-sky-600 hover:bg-sky-50"
            >
              编辑行程
            </a>
          </header>

          <MobileItineraryList
            itineraryId={group.itinerary.id}
            {isItineraryExpanded}
            dayBuckets={group.dayBuckets}
            on:toggle={() => toggleMobileItinerary(group.itinerary.id)}
          />

          <DesktopItineraryTable tableRows={group.tableRows} />
        </article>
      {/each}
    </div>
  {/if}
</section>
