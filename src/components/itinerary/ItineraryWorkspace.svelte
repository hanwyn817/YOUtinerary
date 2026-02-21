<script lang="ts">
  import { onMount, tick } from "svelte";
  import { itineraryStore } from "../../lib/stores/itineraries";
  import { convertCurrency } from "../../lib/api/client";
  import type {
    CurrencyCode,
    DayItem,
    DayItemType,
    Itinerary,
    ItineraryDay,
    LocationPoint,
    TransportMode,
  } from "../../lib/types";
  import {
    createDayItem,
    createEmptyDay,
    uid,
  } from "../../lib/utils/itinerary";
  import {
    DAY_ITEM_OPTIONS,
    extractCostDisplay,
    getDayItemLabel,
    getTransportModeLabel,
    summarizeDayItem,
    summarizeTime,
    suggestGaodeMode,
  } from "../../lib/utils/schedule";
  import DayItemSummary from "./DayItemSummary.svelte";

  const transportOptions: { value: TransportMode; label: string }[] = [
    { value: "plane", label: "飞机" },
    { value: "train", label: "火车" },
    { value: "bus", label: "长途/大巴" },
    { value: "subway", label: "地铁" },
    { value: "car", label: "自驾/租车" },
    { value: "taxi", label: "出租/网约" },
    { value: "rideshare", label: "拼车/顺风" },
    { value: "ferry", label: "轮渡" },
    { value: "bike", label: "骑行" },
    { value: "walk", label: "步行" },
    { value: "other", label: "其他" },
  ];

  const currencyOptions = [
    "CNY",
    "JPY",
    "USD",
    "HKD",
    "EUR",
    "GBP",
    "AUD",
    "TWD",
    "KRW",
    "THB",
    "OTHER",
  ];
  const apiCurrencyOptions: CurrencyCode[] = [
    "CNY",
    "JPY",
    "USD",
    "HKD",
    "EUR",
    "GBP",
    "AUD",
    "TWD",
    "KRW",
    "THB",
  ];
  const apiCurrencySet = new Set<CurrencyCode>(apiCurrencyOptions);

  type TransportItem = Extract<DayItem, { type: "transport" }>;
  type BudgetCategory =
    | "transport"
    | "stay"
    | "activities"
    | "meals"
    | "shopping";

  interface CostEntry {
    dayId: string;
    category: BudgetCategory;
    amount: number;
    currency: CurrencyCode;
  }

  interface DisplayBudget {
    transport: number;
    stay: number;
    activities: number;
    meals: number;
    shopping: number;
    others: number;
    total: number;
    currency: CurrencyCode;
  }

  interface ConversionRateDetail {
    from: CurrencyCode;
    to: CurrencyCode;
    rate: number;
  }

  let draft: Itinerary | null = null;
  let dirty = false;
  let exporting = false;
  let routingItemId: string | null = null;
  let previewMode = false;
  let exportLayoutVisible = false;
  let exportQrDataUrl = "";
  let exportPageUrl = "";
  let confirmingDelete = false;
  let deleting = false;
  let deleteError: string | null = null;
  let displayBudget: DisplayBudget = {
    transport: 0,
    stay: 0,
    activities: 0,
    meals: 0,
    shopping: 0,
    others: 0,
    total: 0,
    currency: "CNY",
  };
  let dayCostInBaseCurrency: Record<string, number> = {};
  let convertingBudget = false;
  let budgetConversionWarning = "";
  let budgetConversionErrors: string[] = [];
  let usedConversionRates: ConversionRateDetail[] = [];
  let conversionJobId = 0;
  const fxRateCache = new Map<string, number>();
  const fxRateInFlight = new Map<string, Promise<number>>();

  $: state = $itineraryStore;

  $: if (
    state.activeItinerary &&
    (!draft || draft.id !== state.activeItinerary.id)
  ) {
    const cloned = cloneValue(state.activeItinerary);
    draft = { ...cloned, days: relabelDays(cloned.days) };
    if (!draft.baseCurrency) {
      draft.baseCurrency = "CNY";
    }
    displayBudget = fallbackDisplayBudget(draft);
    dayCostInBaseCurrency = Object.fromEntries(
      Object.entries(collectRawDayCosts(draft)).map(([dayId, amount]) => [
        dayId,
        roundAmount(amount),
      ]),
    );
    budgetConversionWarning = "";
    budgetConversionErrors = [];
    usedConversionRates = [];
    recalcBudget();
    dirty = false;
  }

  function cloneValue<T>(value: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function markDirty() {
    dirty = true;
  }

  function relabelDays(days: ItineraryDay[]): ItineraryDay[] {
    return days.map((day, index) => ({
      ...day,
      label: `第${index + 1}天`,
      items: day.items.map((item) =>
        item.type === "transport" && item.transport.mode === "high-speed-rail"
          ? { ...item, transport: { ...item.transport, mode: "train" } }
          : item,
      ),
    }));
  }

  function getBaseCurrency(itinerary: Itinerary): CurrencyCode {
    return itinerary.baseCurrency ?? itinerary.totalBudget?.currency ?? "CNY";
  }

  function roundAmount(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  function formatAmount(value: number): string {
    const rounded = roundAmount(value);
    return Number.isInteger(rounded)
      ? String(rounded)
      : String(rounded.toFixed(2)).replace(/\.?0+$/, "");
  }

  function formatRate(value: number): string {
    if (!Number.isFinite(value)) return "0";
    return value.toFixed(6).replace(/\.?0+$/, "");
  }

  function collectCostEntries(itinerary: Itinerary): CostEntry[] {
    const fallbackCurrency = getBaseCurrency(itinerary);
    const entries: CostEntry[] = [];
    itinerary.days.forEach((day) => {
      day.items.forEach((item) => {
        if (item.type === "transport") {
          const amount = item.transport.cost?.amount;
          if (!amount || Number.isNaN(amount)) return;
          entries.push({
            dayId: day.id,
            category: "transport",
            amount,
            currency: item.transport.cost?.currency ?? fallbackCurrency,
          });
          return;
        }
        if (item.type === "stay") {
          const amount = item.stay.cost?.amount;
          if (!amount || Number.isNaN(amount)) return;
          entries.push({
            dayId: day.id,
            category: "stay",
            amount,
            currency: item.stay.cost?.currency ?? fallbackCurrency,
          });
          return;
        }
        if (item.type === "activity") {
          const amount = item.activity.cost?.amount;
          if (!amount || Number.isNaN(amount)) return;
          entries.push({
            dayId: day.id,
            category: "activities",
            amount,
            currency: item.activity.cost?.currency ?? fallbackCurrency,
          });
          return;
        }
        if (item.type === "meal") {
          const amount = item.meal.cost?.amount;
          if (!amount || Number.isNaN(amount)) return;
          entries.push({
            dayId: day.id,
            category: "meals",
            amount,
            currency: item.meal.cost?.currency ?? fallbackCurrency,
          });
          return;
        }
        if (item.type === "shopping") {
          const amount = item.shopping.cost?.amount;
          if (!amount || Number.isNaN(amount)) return;
          entries.push({
            dayId: day.id,
            category: "shopping",
            amount,
            currency: item.shopping.cost?.currency ?? fallbackCurrency,
          });
        }
      });
    });
    return entries;
  }

  function collectRawDayCosts(itinerary: Itinerary): Record<string, number> {
    const result: Record<string, number> = {};
    itinerary.days.forEach((day) => {
      result[day.id] = day.items.reduce((total, item) => {
        const amount =
          item.type === "transport"
            ? item.transport.cost?.amount
            : item.type === "stay"
              ? item.stay.cost?.amount
              : item.type === "activity"
                ? item.activity.cost?.amount
                : item.type === "meal"
                  ? item.meal.cost?.amount
                  : item.type === "shopping"
                    ? item.shopping.cost?.amount
                    : undefined;
        if (!amount || Number.isNaN(amount)) return total;
        return total + amount;
      }, 0);
    });
    return result;
  }

  function fallbackDisplayBudget(itinerary: Itinerary): DisplayBudget {
    const currency = getBaseCurrency(itinerary);
    const transport = itinerary.totalBudget?.transport ?? 0;
    const stay = itinerary.totalBudget?.stay ?? 0;
    const activities = itinerary.totalBudget?.activities ?? 0;
    const meals = itinerary.totalBudget?.meals ?? 0;
    const shopping = itinerary.totalBudget?.shopping ?? 0;
    const others = itinerary.totalBudget?.others ?? 0;
    return {
      transport: roundAmount(transport),
      stay: roundAmount(stay),
      activities: roundAmount(activities),
      meals: roundAmount(meals),
      shopping: roundAmount(shopping),
      others: roundAmount(others),
      total: roundAmount(
        transport + stay + activities + meals + shopping + others,
      ),
      currency,
    };
  }

  async function getRateToCurrency(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number> {
    if (from === to) return 1;
    if (!apiCurrencySet.has(from) || !apiCurrencySet.has(to)) {
      throw new Error(`不支持币种换算（${from}->${to}）`);
    }
    const rateKey = `${from}_${to}`;
    const cachedRate = fxRateCache.get(rateKey);
    if (typeof cachedRate === "number") {
      return cachedRate;
    }
    let ratePromise = fxRateInFlight.get(rateKey);
    if (!ratePromise) {
      ratePromise = convertCurrency({
        from,
        to,
        amount: 1,
      })
        .then((converted) => {
          const rate = Number(converted.result);
          if (!Number.isFinite(rate) || rate <= 0) {
            throw new Error("无效汇率返回");
          }
          fxRateCache.set(rateKey, rate);
          return rate;
        })
        .finally(() => {
          fxRateInFlight.delete(rateKey);
        });
      fxRateInFlight.set(rateKey, ratePromise);
    }
    return await ratePromise;
  }

  async function convertAmountToCurrency(
    amount: number,
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number> {
    if (!amount || Number.isNaN(amount)) return 0;
    const rate = await getRateToCurrency(from, to);
    return amount * rate;
  }

  function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return "未知错误";
  }

  async function refreshConvertedBudget() {
    if (!draft) return;
    const snapshot = cloneValue(draft);
    const baseCurrency = getBaseCurrency(snapshot);
    const entries = collectCostEntries(snapshot);
    const rawDayCosts = collectRawDayCosts(snapshot);
    const fallbackBudget = fallbackDisplayBudget(snapshot);
    const dayLabelMap = new Map(
      snapshot.days.map((day) => [day.id, day.label]),
    );
    const jobId = ++conversionJobId;
    convertingBudget = true;
    budgetConversionWarning = "";
    budgetConversionErrors = [];
    try {
      const categoryTotals: Record<BudgetCategory, number> = {
        transport: 0,
        stay: 0,
        activities: 0,
        meals: 0,
        shopping: 0,
      };
      const dayTotals: Record<string, number> = {};
      snapshot.days.forEach((day) => {
        dayTotals[day.id] = 0;
      });

      let hasFallback = false;
      const conversionErrors: string[] = [];
      const usedRateMap = new Map<string, ConversionRateDetail>();
      await Promise.all(
        entries.map(async (entry) => {
          let amountInBase = entry.amount;
          try {
            amountInBase = await convertAmountToCurrency(
              entry.amount,
              entry.currency,
              baseCurrency,
            );
            if (entry.currency !== baseCurrency) {
              const rate = await getRateToCurrency(
                entry.currency,
                baseCurrency,
              );
              const key = `${entry.currency}_${baseCurrency}`;
              usedRateMap.set(key, {
                from: entry.currency,
                to: baseCurrency,
                rate,
              });
            }
          } catch (error) {
            console.error("currency convert failed", error);
            hasFallback = true;
            const dayLabel = dayLabelMap.get(entry.dayId) ?? entry.dayId;
            conversionErrors.push(
              `${dayLabel} ${entry.category} ${entry.currency}->${baseCurrency}: ${errorMessage(error)}`,
            );
          }
          categoryTotals[entry.category] += amountInBase;
          dayTotals[entry.dayId] = (dayTotals[entry.dayId] ?? 0) + amountInBase;
        }),
      );

      if (jobId !== conversionJobId) return;

      const others = snapshot.totalBudget?.others ?? 0;
      displayBudget = {
        transport: roundAmount(categoryTotals.transport),
        stay: roundAmount(categoryTotals.stay),
        activities: roundAmount(categoryTotals.activities),
        meals: roundAmount(categoryTotals.meals),
        shopping: roundAmount(categoryTotals.shopping),
        others: roundAmount(others),
        total: roundAmount(
          categoryTotals.transport +
            categoryTotals.stay +
            categoryTotals.activities +
            categoryTotals.meals +
            categoryTotals.shopping +
            others,
        ),
        currency: baseCurrency,
      };
      dayCostInBaseCurrency = Object.fromEntries(
        Object.entries(entries.length ? dayTotals : rawDayCosts).map(
          ([dayId, amount]) => [dayId, roundAmount(amount)],
        ),
      );
      usedConversionRates = Array.from(usedRateMap.values()).sort((a, b) =>
        a.from.localeCompare(b.from),
      );
      budgetConversionErrors = conversionErrors;
      budgetConversionWarning = hasFallback
        ? `部分币种换算失败（${conversionErrors.length}项），暂按原金额计入。`
        : "";
      if (conversionErrors.length) {
        console.error("budget conversion details", conversionErrors);
      }
    } catch (error) {
      console.error("refreshConvertedBudget failed", error);
      if (jobId !== conversionJobId) return;
      displayBudget = fallbackBudget;
      dayCostInBaseCurrency = Object.fromEntries(
        Object.entries(rawDayCosts).map(([dayId, amount]) => [
          dayId,
          roundAmount(amount),
        ]),
      );
      budgetConversionWarning = "汇率服务不可用，暂按原金额汇总。";
      budgetConversionErrors = [errorMessage(error)];
      usedConversionRates = [];
    } finally {
      if (jobId === conversionJobId) {
        convertingBudget = false;
      }
    }
  }

  type LocationEntity =
    | "transport-from"
    | "transport-to"
    | "stay"
    | "activity"
    | "meal"
    | "shopping";

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
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent<LocationRequestPayload>("youtinerary:location-request", {
        detail: payload,
      }),
    );
  }

  function mutateItem(
    dayId: string,
    itemId: string,
    mutator: (item: DayItem) => DayItem,
  ) {
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
      }),
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
        draft.days.map((day) =>
          day.id === dayId ? { ...day, items: [...day.items, nextItem] } : day,
        ),
      ),
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
          day.id === dayId
            ? {
                ...day,
                items: day.items.filter((entry) => entry.id !== itemId),
              }
            : day,
        ),
      ),
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
        }),
      ),
    };
    recalcBudget();
    markDirty();
  }

  function recalcBudget() {
    if (!draft) return;
    let transport = 0;
    let stay = 0;
    let activities = 0;
    let meals = 0;
    let shopping = 0;
    draft.days.forEach((day) => {
      day.items.forEach((item) => {
        const amount =
          item.type === "transport"
            ? item.transport.cost?.amount
            : item.type === "stay"
              ? item.stay.cost?.amount
              : item.type === "activity"
                ? item.activity.cost?.amount
                : item.type === "meal"
                  ? item.meal.cost?.amount
                  : item.type === "shopping"
                    ? item.shopping.cost?.amount
                    : undefined;
        if (amount && !Number.isNaN(amount)) {
          if (item.type === "transport") transport += amount;
          if (item.type === "stay") stay += amount;
          if (item.type === "activity") activities += amount;
          if (item.type === "meal") meals += amount;
          if (item.type === "shopping") shopping += amount;
        }
      });
    });
    const others = draft.totalBudget?.others ?? 0;
    const currency = draft.baseCurrency ?? draft.totalBudget?.currency ?? "CNY";
    draft = {
      ...draft,
      totalBudget: {
        transport,
        stay,
        activities,
        meals,
        shopping,
        others,
        currency,
      },
    };
    void refreshConvertedBudget();
  }

  function summarizeRoute(raw: unknown, mode: GaodeMode): string | null {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("raw" in (raw as Record<string, unknown>))
    )
      return null;
    const data = (raw as { raw: any }).raw;
    try {
      if (mode === "transit") {
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
      const tolls = path.tolls ? `；过路费约 ${path.tolls} 元` : "";
      return `高德推荐：约 ${distanceKm} 公里，耗时 ${durationMin} 分钟${tolls}`;
    } catch (error) {
      console.error("summarize route error", error);
      return null;
    }
  }

  type GaodeMode = "driving" | "transit" | "walking" | "bicycling";

  async function planRoute(dayId: string, item: TransportItem) {
    const segment = item.transport;
    if (!segment.fromLocation || !segment.toLocation) {
      alert("请先为出发地和到达地选择具体地点（需包含经纬度）。");
      return;
    }
    try {
      routingItemId = item.id;
      const mode = suggestGaodeMode(segment.mode ?? "other");
      const params = new URLSearchParams({
        mode,
        origin: `${segment.fromLocation.lng},${segment.fromLocation.lat}`,
        destination: `${segment.toLocation.lng},${segment.toLocation.lat}`,
      });
      const res = await fetch(`/api/gaode/route?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("路线规划失败，请检查权限或稍后尝试。");
      }
      const data = await res.json();
      const summary = summarizeRoute(data, mode);
      if (summary) {
        mutateItem(dayId, item.id, (entry) => {
          if (entry.type !== "transport") return entry;
          entry.transport.memo =
            summary + (entry.transport.memo ? `\n${entry.transport.memo}` : "");
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
      days: relabelDays(
        draft.days.map((day) =>
          day.id === dayId ? { ...day, ...patch } : day,
        ),
      ),
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
    copy.id = uid("day_");
    copy.label = `${day.label} - 复制`;
    draft = { ...draft, days: relabelDays([...draft.days, copy]) };
    recalcBudget();
    markDirty();
  }

  function deleteDay(dayId: string) {
    if (!draft) return;
    draft = {
      ...draft,
      days: relabelDays(draft.days.filter((day) => day.id !== dayId)),
    };
    recalcBudget();
    markDirty();
  }

  function confirmDeleteDay(dayId: string) {
    if (!draft) return;
    const day = draft.days.find((item) => item.id === dayId);
    const label = day?.label ?? "该日程";
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`确认删除${label}吗？`);
      if (!confirmed) return;
    }
    deleteDay(dayId);
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
      if (entry.type === "transport") {
        if (detail.entity === "transport-from") {
          entry.transport.from = detail.location.name;
          entry.transport.fromLocation = detail.location;
        } else if (detail.entity === "transport-to") {
          entry.transport.to = detail.location.name;
          entry.transport.toLocation = detail.location;
        }
      }
      if (entry.type === "stay" && detail.entity === "stay") {
        entry.stay.name = detail.location.name;
        entry.stay.address = detail.location.address ?? entry.stay.address;
        entry.stay.location = detail.location;
      }
      if (entry.type === "activity" && detail.entity === "activity") {
        entry.activity.name = detail.location.name;
        entry.activity.address =
          detail.location.address ?? entry.activity.address;
        entry.activity.location = detail.location;
      }
      if (entry.type === "meal" && detail.entity === "meal") {
        entry.meal.name = detail.location.name;
        entry.meal.address = detail.location.address ?? entry.meal.address;
        entry.meal.location = detail.location;
      }
      if (entry.type === "shopping" && detail.entity === "shopping") {
        entry.shopping.name = detail.location.name;
        entry.shopping.address =
          detail.location.address ?? entry.shopping.address;
        entry.shopping.location = detail.location;
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
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } else {
      deleteError = state.error ?? "删除失败，请稍后重试。";
    }
  }

  function exportAsJson() {
    if (!draft) return;
    try {
      const dataStr = JSON.stringify(draft, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${draft.slug || draft.id || "itinerary"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export JSON:", error);
      alert("导出 JSON 失败，请检查控制台。");
    }
  }

  async function exportAsImage() {
    if (!draft) return;
    exporting = true;
    try {
      const [{ default: html2canvas }, qrModule] = await Promise.all([
        import("html2canvas"),
        import("qrcode"),
      ]);

      const QRCode = (qrModule as any).default ?? qrModule;
      if (!QRCode?.toDataURL) {
        throw new Error("二维码模块加载失败");
      }

      const itineraryUrl = new URL(
        `/itinerary/${draft.id}`,
        window.location.origin,
      ).toString();
      exportPageUrl = itineraryUrl;
      exportQrDataUrl = await QRCode.toDataURL(itineraryUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });

      exportLayoutVisible = true;
      await tick();

      const element = document.getElementById("itinerary-export-sheet");
      if (!element) {
        throw new Error("未找到导出容器");
      }

      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        onclone: (clonedDocument) => {
          clonedDocument
            .querySelectorAll('style, link[rel="stylesheet"]')
            .forEach((node) => {
              node.remove();
            });
          clonedDocument.body.style.background = "#ffffff";
          clonedDocument.body.style.color = "#0f172a";
        },
      });

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${draft.slug || draft.id}.png`;
      link.click();
    } catch (error) {
      console.error(error);
      alert("导出失败，请稍后重试。");
    } finally {
      exportLayoutVisible = false;
      exporting = false;
    }
  }

  function copyItinerary() {
    if (!draft) return;
    const copy = cloneValue(draft);
    copy.id = "";
    copy.title = `${draft.title} - 复制`;
    copy.slug = `${draft.slug || draft.id}-copy`;
    itineraryStore.createDraft(copy);
  }

  function typeLabel(type: DayItemType): string {
    return getDayItemLabel(type);
  }

  function timelineTime(item: DayItem): string {
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

  function timelineCost(item: DayItem): string {
    const currency =
      draft?.baseCurrency ?? draft?.totalBudget?.currency ?? "CNY";
    return extractCostDisplay(item, currency);
  }

  function timelineSummary(item: DayItem): string {
    return summarizeDayItem(item);
  }

  function timelineMode(item: DayItem): string | null {
    if (item.type !== "transport") return null;
    return getTransportModeLabel(item.transport.mode);
  }

  function timelineNotes(item: DayItem): string[] {
    if (item.type === "transport") {
      return [item.transport.memo?.trim()].filter(Boolean) as string[];
    }
    if (item.type === "stay") {
      return [item.stay.memo?.trim()].filter(Boolean) as string[];
    }
    if (item.type === "activity") {
      return [item.activity.memo?.trim()].filter(Boolean) as string[];
    }
    if (item.type === "meal") {
      return [item.meal.memo?.trim()].filter(Boolean) as string[];
    }
    if (item.type === "shopping") {
      return [item.shopping.memo?.trim()].filter(Boolean) as string[];
    }
    return [];
  }

  function rawDayCost(day: ItineraryDay): number {
    return day.items.reduce((total, item) => {
      const amount =
        item.type === "transport"
          ? item.transport.cost?.amount
          : item.type === "stay"
            ? item.stay.cost?.amount
            : item.type === "activity"
              ? item.activity.cost?.amount
              : item.type === "meal"
                ? item.meal.cost?.amount
                : item.type === "shopping"
                  ? item.shopping.cost?.amount
                  : undefined;
      if (!amount || Number.isNaN(amount)) return total;
      return total + amount;
    }, 0);
  }

  function dayCost(day: ItineraryDay): number {
    return dayCostInBaseCurrency[day.id] ?? rawDayCost(day);
  }

  onMount(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<LocationAppliedDetail>).detail;
      if (!detail) return;
      applyLocation(detail);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(
        "youtinerary:location-applied",
        handler as EventListener,
      );
    }
    if (!state.list.length) {
      itineraryStore.loadList();
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "youtinerary:location-applied",
          handler as EventListener,
        );
      }
    };
  });
</script>

{#if !draft}
  <div
    class="flex h-full min-h-[400px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-slate-500"
  >
    <p class="text-base">
      请选择左侧的行程查看详情，或点击“新建行程”开始规划。
    </p>
  </div>
{:else}
  <div class="flex flex-col gap-6">
    <div
      class="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100"
    >
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div class="flex flex-1 flex-col gap-4">
          <div class="flex items-end gap-4">
            <label class="flex flex-1 flex-col gap-2 text-sm text-slate-600">
              行程标题
              <input
                class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                bind:value={draft.title}
                on:input={markDirty}
                placeholder="给行程起个名字吧"
              />
            </label>
            <label
              class="flex w-28 flex-shrink-0 flex-col gap-2 text-sm text-slate-600"
            >
              费用基准货币
              <select
                class="rounded-2xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
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
          </div>
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
            {dirty ? "保存行程" : "已保存"}
          </button>
          <button
            class="inline-flex items-center justify-center rounded-full border border-sky-300 px-5 py-2 font-semibold text-sky-600 hover:border-sky-400 hover:text-sky-500"
            on:click={() => (previewMode = !previewMode)}
          >
            {previewMode ? "返回编辑模式" : "行程预览"}
          </button>
          <button
            class="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-500 disabled:opacity-60"
            on:click={exportAsImage}
            disabled={exporting}
          >
            {exporting ? "导出中…" : "导出为图片"}
          </button>
          <button
            class="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-500 disabled:opacity-60"
            on:click={exportAsJson}
            disabled={exporting}
            title="导出 JSON 数据备份"
          >
            导出为 JSON
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
      class="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-xl shadow-sky-100"
    >
      <header class="flex flex-col gap-2">
        <h2 class="text-2xl font-semibold text-slate-800">{draft.title}</h2>
        {#if draft.description}
          <p class="text-sm text-slate-500">{draft.description}</p>
        {/if}
      </header>
    </div>

    <section
      class="rounded-3xl border border-slate-200 bg-sky-50/60 p-6 text-sm text-slate-700 shadow-xl shadow-sky-100"
    >
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold text-slate-700">费用概览</h3>
        <p class="text-sm font-semibold text-slate-700">
          总费用 {formatAmount(displayBudget.total)}{displayBudget.currency}
        </p>
      </div>
      {#if convertingBudget}
        <p class="mt-2 text-xs text-slate-500">汇率换算中...</p>
      {:else if budgetConversionWarning}
        <p class="mt-2 text-xs text-amber-600">{budgetConversionWarning}</p>
        {#if budgetConversionErrors.length}
          <div
            class="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          >
            {#each budgetConversionErrors.slice(0, 3) as detail}
              <p>{detail}</p>
            {/each}
            {#if budgetConversionErrors.length > 3}
              <p>
                还有 {budgetConversionErrors.length - 3} 项，请查看浏览器控制台日志。
              </p>
            {/if}
          </div>
        {/if}
      {/if}
      {#if usedConversionRates.length}
        <div
          class="mt-2 rounded-xl border border-sky-100 bg-white/70 px-3 py-2 text-xs text-slate-600"
        >
          <p>本次换算汇率</p>
          <div class="mt-1 flex flex-wrap gap-2">
            {#each usedConversionRates as detail}
              <span
                class="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600"
              >
                1 {detail.from} = {formatRate(detail.rate)}
                {detail.to}
              </span>
            {/each}
          </div>
        </div>
      {/if}
      <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <span class="text-xs text-slate-500">交通</span>
          <span class="text-base font-semibold text-slate-700"
            >{formatAmount(
              displayBudget.transport,
            )}{displayBudget.currency}</span
          >
        </div>
        <div
          class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <span class="text-xs text-slate-500">住宿</span>
          <span class="text-base font-semibold text-slate-700"
            >{formatAmount(displayBudget.stay)}{displayBudget.currency}</span
          >
        </div>
        <div
          class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <span class="text-xs text-slate-500">游玩</span>
          <span class="text-base font-semibold text-slate-700"
            >{formatAmount(
              displayBudget.activities,
            )}{displayBudget.currency}</span
          >
        </div>
        <div
          class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <span class="text-xs text-slate-500">餐饮</span>
          <span class="text-base font-semibold text-slate-700"
            >{formatAmount(displayBudget.meals)}{displayBudget.currency}</span
          >
        </div>
        <div
          class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <span class="text-xs text-slate-500">购物</span>
          <span class="text-base font-semibold text-slate-700"
            >{formatAmount(
              displayBudget.shopping,
            )}{displayBudget.currency}</span
          >
        </div>
        <div
          class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <span class="text-xs text-slate-500">其他</span>
          <span class="text-base font-semibold text-slate-700"
            >{formatAmount(displayBudget.others)}{displayBudget.currency}</span
          >
        </div>
      </div>
    </section>

    {#if previewMode}
      <div class="flex flex-col gap-5">
        {#each draft.days as day, dayIndex}
          <article
            class="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-inner shadow-slate-100"
          >
            <header
              class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold text-slate-800">
                  {day.label || `第${dayIndex + 1}天`}
                </h3>
                {#if day.date}
                  <span class="text-xs text-slate-500">{day.date}</span>
                {/if}
              </div>
              {#if dayCost(day) > 0}
                <span
                  class="inline-flex items-center rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs text-sky-600"
                >
                  预计费用 {formatAmount(dayCost(day))}{displayBudget.currency}
                </span>
              {/if}
            </header>
            <div class="mt-4 flex flex-col gap-4">
              {#if day.items.length === 0}
                <div
                  class="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500"
                >
                  这一天暂未安排。
                </div>
              {:else}
                {#each day.items as entry, index}
                  <div class="relative pl-9">
                    <span
                      class="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold text-white"
                      >{index + 1}</span
                    >
                    <div
                      class="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm"
                    >
                      <div
                        class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
                      >
                        <span>{timelineTime(entry) || "时间未定"}</span>
                        {#if timelineCost(entry)}
                          <span class="text-sky-600">{timelineCost(entry)}</span
                          >
                        {/if}
                      </div>
                      <div
                        class="mt-2 text-sm font-semibold text-slate-800 flex flex-wrap gap-1.5 items-center"
                      >
                        <DayItemSummary item={entry} />
                      </div>
                      <div
                        class="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"
                      >
                        <span
                          class="rounded-full bg-sky-100 px-2 py-1 text-sky-600"
                          >{typeLabel(entry.type)}</span
                        >
                        {#if timelineMode(entry)}
                          <span
                            class="rounded-full bg-emerald-100 px-2 py-1 text-emerald-600"
                            >{timelineMode(entry)}</span
                          >
                        {/if}
                      </div>
                      {#if timelineNotes(entry).length}
                        {#each timelineNotes(entry) as note, noteIndex}
                          <p
                            class="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500"
                          >
                            {note}
                          </p>
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
        <section
          class="rounded-2xl border border-slate-200 bg-slate-100/80 p-5"
        >
          <div
            class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xl font-semibold text-slate-800">
                  {day.label || `第${dayIndex + 1}天`}
                </h3>
                {#if day.date}
                  <span class="text-sm text-slate-500">{day.date}</span>
                {/if}
              </div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                <label class="flex items-center gap-2">
                  日期（可选）
                  <input
                    type="date"
                    class="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"
                    value={day.date ?? ""}
                    on:change={(event) =>
                      updateDay(day.id, {
                        date: (event.target as HTMLInputElement).value,
                      })}
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
                  on:click={() => confirmDeleteDay(day.id)}
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
                <span
                  class="rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs text-sky-600"
                >
                  预计费用 {formatAmount(dayCost(day))}{displayBudget.currency}
                </span>
              {/if}
            </div>
          </div>

          <div class="mt-4 md:hidden">
            <div class="rounded-2xl border border-sky-100 bg-white/80 p-3">
              <h4
                class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400"
              >
                今日概览
              </h4>
              <div class="mt-3 flex flex-col gap-3">
                {#if day.items.length === 0}
                  <p
                    class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500"
                  >
                    暂无安排
                  </p>
                {:else}
                  {#each day.items as entry, index}
                    <div
                      class="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                    >
                      <div
                        class="flex items-center justify-between gap-2 text-xs text-slate-500"
                      >
                        <span>{timelineTime(entry) || `#${index + 1}`}</span>
                        {#if timelineCost(entry)}
                          <span class="text-sky-600">{timelineCost(entry)}</span
                          >
                        {/if}
                      </div>
                      <p class="mt-1 text-sm font-semibold text-slate-700">
                        {timelineSummary(entry)}
                      </p>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-4">
            {#if day.items.length === 0}
              <p
                class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"
              >
                暂无安排，添加一条交通 / 住宿 / 游玩 / 餐饮 / 购物记录开始吧。
              </p>
            {/if}
            {#each day.items as entry, index}
              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2 text-xs text-slate-500">
                    <span
                      class="rounded-full border border-sky-200 px-2 py-0.5 text-sky-600"
                      >{typeLabel(entry.type)}</span
                    >
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

                {#if entry.type === "transport"}
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
                                entity: "transport-from",
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.transport.fromLocation,
                              })}
                          >
                            选地点
                          </button>
                        </div>
                        {#if entry.transport.fromLocation}
                          <div
                            class="mt-1 flex items-center justify-between text-[11px] text-emerald-600"
                          >
                            <span
                              class="flex items-center gap-1 truncate"
                              title={entry.transport.fromLocation.name}
                            >
                              <svg
                                class="h-3 w-3 shrink-0"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                ><path
                                  fill-rule="evenodd"
                                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                  clip-rule="evenodd"
                                /></svg
                              >
                              已绑定坐标: {entry.transport.fromLocation.name}
                            </span>
                            <button
                              type="button"
                              class="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                              on:click|preventDefault={() => {
                                entry.transport.fromLocation = undefined;
                                markDirty();
                              }}>清除绑定</button
                            >
                          </div>
                        {/if}
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
                                entity: "transport-to",
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.transport.toLocation,
                              })}
                          >
                            选地点
                          </button>
                        </div>
                        {#if entry.transport.toLocation}
                          <div
                            class="mt-1 flex items-center justify-between text-[11px] text-emerald-600"
                          >
                            <span
                              class="flex items-center gap-1 truncate"
                              title={entry.transport.toLocation.name}
                            >
                              <svg
                                class="h-3 w-3 shrink-0"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                ><path
                                  fill-rule="evenodd"
                                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                  clip-rule="evenodd"
                                /></svg
                              >
                              已绑定坐标: {entry.transport.toLocation.name}
                            </span>
                            <button
                              type="button"
                              class="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                              on:click|preventDefault={() => {
                                entry.transport.toLocation = undefined;
                                markDirty();
                              }}>清除绑定</button
                            >
                          </div>
                        {/if}
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
                          value={entry.transport.cost?.amount ?? ""}
                          on:input={(event) => {
                            const amount = Number(
                              (event.target as HTMLInputElement).value || 0,
                            );
                            const currency =
                              entry.transport.cost?.currency ??
                              draft?.baseCurrency ??
                              "CNY";
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
                          value={entry.transport.cost?.currency ??
                            draft?.baseCurrency ??
                            "CNY"}
                          on:change={(event) => {
                            const currency = (event.target as HTMLSelectElement)
                              .value;
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
                          {routingItemId === entry.id
                            ? "获取路线中…"
                            : "高德路线建议"}
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
                {:else if entry.type === "stay"}
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
                                entity: "stay",
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.stay.location,
                              })}
                          >
                            选地点
                          </button>
                        </div>
                        {#if entry.stay.location}
                          <div
                            class="mt-1 flex items-center justify-between text-[11px] text-emerald-600"
                          >
                            <span
                              class="flex items-center gap-1 truncate"
                              title={entry.stay.location.name}
                            >
                              <svg
                                class="h-3 w-3 shrink-0"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                ><path
                                  fill-rule="evenodd"
                                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                  clip-rule="evenodd"
                                /></svg
                              >
                              已绑定坐标: {entry.stay.location.name}
                            </span>
                            <button
                              type="button"
                              class="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                              on:click|preventDefault={() => {
                                entry.stay.location = undefined;
                                markDirty();
                              }}>清除绑定</button
                            >
                          </div>
                        {/if}
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
                    <div class="grid gap-3 md:grid-cols-4">
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
                          value={entry.stay.cost?.amount ?? ""}
                          on:input={(event) => {
                            const amount = Number(
                              (event.target as HTMLInputElement).value || 0,
                            );
                            const currency =
                              entry.stay.cost?.currency ??
                              draft?.baseCurrency ??
                              "CNY";
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
                {:else if entry.type === "activity"}
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
                                entity: "activity",
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.activity.location,
                              })}
                          >
                            选地点
                          </button>
                        </div>
                        {#if entry.activity.location}
                          <div
                            class="mt-1 flex items-center justify-between text-[11px] text-emerald-600"
                          >
                            <span
                              class="flex items-center gap-1 truncate"
                              title={entry.activity.location.name}
                            >
                              <svg
                                class="h-3 w-3 shrink-0"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                ><path
                                  fill-rule="evenodd"
                                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                  clip-rule="evenodd"
                                /></svg
                              >
                              已绑定坐标: {entry.activity.location.name}
                            </span>
                            <button
                              type="button"
                              class="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                              on:click|preventDefault={() => {
                                entry.activity.location = undefined;
                                markDirty();
                              }}>清除绑定</button
                            >
                          </div>
                        {/if}
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
                    <div class="grid gap-3 md:grid-cols-4">
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
                          value={entry.activity.cost?.amount ?? ""}
                          on:input={(event) => {
                            const amount = Number(
                              (event.target as HTMLInputElement).value || 0,
                            );
                            const currency =
                              entry.activity.cost?.currency ?? "CNY";
                            entry.activity.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用货币
                        <select
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.activity.cost?.currency ?? "CNY"}
                          on:change={(event) => {
                            const currency = (event.target as HTMLSelectElement)
                              .value;
                            const amount = entry.activity.cost?.amount ?? 0;
                            entry.activity.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        >
                          {#each currencyOptions as option}
                            <option value={option}>{option}</option>
                          {/each}
                        </select>
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
                {:else if entry.type === "meal"}
                  <div class="mt-3 flex flex-col gap-3">
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        餐饮地点
                        <div class="flex gap-2">
                          <input
                            class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            bind:value={entry.meal.name}
                            on:input={markDirty}
                          />
                          <button
                            type="button"
                            class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                            on:click={() =>
                              openLocationPicker({
                                entity: "meal",
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.meal.location,
                              })}
                          >
                            选地点
                          </button>
                        </div>
                        {#if entry.meal.location}
                          <div
                            class="mt-1 flex items-center justify-between text-[11px] text-emerald-600"
                          >
                            <span
                              class="flex items-center gap-1 truncate"
                              title={entry.meal.location.name}
                            >
                              <svg
                                class="h-3 w-3 shrink-0"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                ><path
                                  fill-rule="evenodd"
                                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                  clip-rule="evenodd"
                                /></svg
                              >
                              已绑定坐标: {entry.meal.location.name}
                            </span>
                            <button
                              type="button"
                              class="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                              on:click|preventDefault={() => {
                                entry.meal.location = undefined;
                                markDirty();
                              }}>清除绑定</button
                            >
                          </div>
                        {/if}
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        地址
                        <input
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.meal.address}
                          on:input={markDirty}
                        />
                      </label>
                    </div>
                    <div class="grid gap-3 md:grid-cols-4">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        开始时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.meal.startTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        结束时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.meal.endTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用
                        <input
                          type="number"
                          min="0"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.meal.cost?.amount ?? ""}
                          on:input={(event) => {
                            const amount = Number(
                              (event.target as HTMLInputElement).value || 0,
                            );
                            const currency = entry.meal.cost?.currency ?? "CNY";
                            entry.meal.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用货币
                        <select
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.meal.cost?.currency ?? "CNY"}
                          on:change={(event) => {
                            const currency = (event.target as HTMLSelectElement)
                              .value;
                            const amount = entry.meal.cost?.amount ?? 0;
                            entry.meal.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        >
                          {#each currencyOptions as option}
                            <option value={option}>{option}</option>
                          {/each}
                        </select>
                      </label>
                    </div>
                    <label class="flex flex-col gap-1 text-xs text-slate-600">
                      备注
                      <textarea
                        class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        bind:value={entry.meal.memo}
                        rows={2}
                        on:input={markDirty}
                      />
                    </label>
                  </div>
                {:else if entry.type === "shopping"}
                  <div class="mt-3 flex flex-col gap-3">
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        购物地点
                        <div class="flex gap-2">
                          <input
                            class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                            bind:value={entry.shopping.name}
                            on:input={markDirty}
                          />
                          <button
                            type="button"
                            class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500"
                            on:click={() =>
                              openLocationPicker({
                                entity: "shopping",
                                dayId: day.id,
                                itemId: entry.id,
                                existing: entry.shopping.location,
                              })}
                          >
                            选地点
                          </button>
                        </div>
                        {#if entry.shopping.location}
                          <div
                            class="mt-1 flex items-center justify-between text-[11px] text-emerald-600"
                          >
                            <span
                              class="flex items-center gap-1 truncate"
                              title={entry.shopping.location.name}
                            >
                              <svg
                                class="h-3 w-3 shrink-0"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                ><path
                                  fill-rule="evenodd"
                                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                  clip-rule="evenodd"
                                /></svg
                              >
                              已绑定坐标: {entry.shopping.location.name}
                            </span>
                            <button
                              type="button"
                              class="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                              on:click|preventDefault={() => {
                                entry.shopping.location = undefined;
                                markDirty();
                              }}>清除绑定</button
                            >
                          </div>
                        {/if}
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        地址
                        <input
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.shopping.address}
                          on:input={markDirty}
                        />
                      </label>
                    </div>
                    <div class="grid gap-3 md:grid-cols-4">
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        开始时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.shopping.startTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        结束时间
                        <input
                          type="time"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          bind:value={entry.shopping.endTime}
                          on:change={markDirty}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用
                        <input
                          type="number"
                          min="0"
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.shopping.cost?.amount ?? ""}
                          on:input={(event) => {
                            const amount = Number(
                              (event.target as HTMLInputElement).value || 0,
                            );
                            const currency =
                              entry.shopping.cost?.currency ?? "CNY";
                            entry.shopping.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        />
                      </label>
                      <label class="flex flex-col gap-1 text-xs text-slate-600">
                        费用货币
                        <select
                          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          value={entry.shopping.cost?.currency ?? "CNY"}
                          on:change={(event) => {
                            const currency = (event.target as HTMLSelectElement)
                              .value;
                            const amount = entry.shopping.cost?.amount ?? 0;
                            entry.shopping.cost = { amount, currency };
                            recalcBudget();
                            markDirty();
                          }}
                        >
                          {#each currencyOptions as option}
                            <option value={option}>{option}</option>
                          {/each}
                        </select>
                      </label>
                    </div>
                    <label class="flex flex-col gap-1 text-xs text-slate-600">
                      备注
                      <textarea
                        class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        bind:value={entry.shopping.memo}
                        rows={2}
                        on:input={markDirty}
                      />
                    </label>
                  </div>
                {:else}
                  <label
                    class="mt-3 flex flex-col gap-1 text-xs text-slate-600"
                  >
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
{/if}

{#if exportLayoutVisible && draft}
  <div
    style="position: fixed; left: -9999px; top: 0; width: 0; height: 0; overflow: visible;"
  >
    <div
      id="itinerary-export-sheet"
      style="all: initial; display: block; width: 480px; margin: 0 auto; overflow: hidden; border-radius: 16px; padding: 32px; background: #ffffff; color: #1e293b; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; box-sizing: border-box;"
    >
      <header
        style="margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;"
      >
        <span
          style="display: block; font-size: 12px; font-weight: 600; color: #0891b2; text-transform: uppercase; margin-bottom: 8px;"
        >
          YOUtinerary · 灵感随行
        </span>
        <h1
          style="margin: 0; font-size: 28px; font-weight: 700; line-height: 1.3; color: #0f172a; word-break: break-word;"
        >
          {draft.title}
        </h1>
        {#if draft.description}
          <p
            style="margin: 8px 0 0; font-size: 14px; color: #64748b; line-height: 1.5; word-break: break-word;"
          >
            {draft.description}
          </p>
        {/if}
        <div
          style="display: flex; justify-content: space-between; margin-top: 16px; font-size: 13px; color: #94a3b8;"
        >
          <span style="white-space: nowrap;">{draft.days.length} 天行程</span>
          <span style="white-space: nowrap;"
            >更新于 {new Date(
              draft.updatedAt ?? draft.createdAt ?? Date.now(),
            ).toLocaleDateString("zh-CN")}</span
          >
        </div>
      </header>

      <div style="display: flex; flex-direction: column; gap: 32px;">
        {#each draft.days as day, dayIndex}
          <section>
            <!-- Day Header -->
            <div
              style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; background: #f8fafc; padding: 10px 14px; border-radius: 8px;"
            >
              <div style="display: flex; align-items: center; flex: 1;">
                <h2
                  style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; white-space: nowrap; margin-right: 8px;"
                >
                  {day.label || `第${dayIndex + 1}天`}
                </h2>
                {#if day.date}
                  <span
                    style="font-size: 14px; color: #64748b; font-weight: 500; white-space: nowrap;"
                  >
                    {day.date}
                  </span>
                {/if}
              </div>
              {#if dayCost(day) > 0}
                <span
                  style="font-size: 14px; font-weight: 600; color: #0891b2; white-space: nowrap; flex-shrink: 0; margin-left: 8px;"
                >
                  {formatAmount(dayCost(day))}
                  {displayBudget.currency}
                </span>
              {/if}
            </div>

            {#if day.items.length === 0}
              <div
                style="padding: 12px 14px; font-size: 13px; color: #94a3b8; font-style: italic;"
              >
                当日暂无安排
              </div>
            {:else}
              <div style="display: flex; flex-direction: column;">
                {#each day.items as entry, index}
                  <div
                    style="position: relative; padding-bottom: {index ===
                    day.items.length - 1
                      ? '8px'
                      : '24px'}; padding-left: 32px;"
                  >
                    <!-- Timeline Line elements (absolute positioned for html2canvas compatibility) -->
                    <div
                      style="position: absolute; left: 8px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: #0ea5e9; border: 2px solid #e0f2fe; box-sizing: border-box; z-index: 2;"
                    ></div>
                    {#if index < day.items.length - 1}
                      <div
                        style="position: absolute; left: 12px; top: 16px; bottom: -6px; width: 2px; background: #e2e8f0; z-index: 1;"
                      ></div>
                    {/if}

                    <!-- Content -->
                    <div
                      style="display: flex; flex-direction: column; padding-bottom: 2px;"
                    >
                      <!-- Time and Summary Layout -->
                      <div
                        style="display: flex; flex-direction: row; align-items: flex-start; margin-bottom: 6px;"
                      >
                        {#if timelineTime(entry)}
                          <div
                            style="font-size: 14px; font-weight: 600; color: #334155; margin-right: 12px; padding-top: 1px; flex-shrink: 0;"
                          >
                            {timelineTime(entry)}
                          </div>
                        {/if}
                        <div
                          style="font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4; word-break: break-word; flex: 1;"
                        >
                          {timelineSummary(entry)}
                        </div>
                      </div>

                      <!-- Badges -->
                      <div
                        style="display: flex; flex-direction: row; align-items: center; flex-wrap: wrap; margin-bottom: 6px;"
                      >
                        {#key entry.type}
                          <div
                            style="font-size: 12px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 500; margin-right: 8px; margin-bottom: 4px;"
                          >
                            {typeLabel(entry.type)}
                          </div>
                        {/key}
                        {#if timelineMode(entry)}
                          <div
                            style="font-size: 12px; padding: 2px 6px; border-radius: 4px; background: #ecfdf5; color: #059669; font-weight: 500; margin-right: 8px; margin-bottom: 4px;"
                          >
                            {timelineMode(entry)}
                          </div>
                        {/if}
                        {#if timelineCost(entry)}
                          <div
                            style="font-size: 13px; font-weight: 600; color: #0d9488; margin-bottom: 4px;"
                          >
                            {timelineCost(entry)}
                          </div>
                        {/if}
                      </div>

                      <!-- Notes -->
                      {#if timelineNotes(entry).length > 0}
                        <div style="display: flex; flex-direction: column;">
                          {#each timelineNotes(entry) as note}
                            <div
                              style="background: #f8fafc; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #64748b; line-height: 1.5; word-break: break-word; border-left: 2px solid #cbd5e1; margin-bottom: 6px;"
                            >
                              {note}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      </div>

      <footer
        style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; display: flex; align-items: center;"
      >
        {#if exportQrDataUrl}
          <img
            src={exportQrDataUrl}
            alt="QR Code"
            style="width: 72px; height: 72px; border-radius: 8px; border: 1px solid #e2e8f0; padding: 4px; flex-shrink: 0; background: #ffffff; margin-right: 16px;"
          />
        {/if}
        <div style="display: flex; flex-direction: column;">
          <div
            style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;"
          >
            线上版查看与编辑
          </div>
          <div
            style="font-size: 13px; color: #64748b; line-height: 1.4; word-break: break-word;"
          >
            扫描或长按识别二维码，进入浏览器以编辑此行程。
          </div>
        </div>
      </footer>
    </div>
  </div>
{/if}

{#if confirmingDelete}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4"
  >
    <div
      class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      <h3 class="text-lg font-semibold text-slate-900">确认删除行程</h3>
      <p class="mt-3 text-sm text-slate-600">
        确定要删除当前行程吗？删除后无法恢复，所有安排与备注都会被清除。
      </p>
      {#if deleteError}
        <p
          class="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600"
        >
          {deleteError}
        </p>
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
          {deleting ? "删除中…" : "确认删除"}
        </button>
      </div>
    </div>
  </div>
{/if}
