<script lang="ts">
    import type { DayItem } from "../../lib/types";
    import { getTransportModeLabel } from "../../lib/utils/schedule";
    import LocationLink from "./LocationLink.svelte";

    export let item: DayItem;
</script>

{#if item.type === "transport"}
    {@const segment = item.transport}
    <span class="inline-flex flex-wrap items-center gap-1.5 align-middle">
        <LocationLink
            location={segment.fromLocation}
            fallbackName={segment.from || "未填"}
        />
        <span class="text-slate-400">→</span>
        <LocationLink
            location={segment.toLocation}
            fallbackName={segment.to || "未填"}
        />
        {#if segment.route?.trim()}
            <span class="text-slate-400">·</span>
            <span>{segment.route.trim()}</span>
        {:else if !segment.from && !segment.to}
            <span>{getTransportModeLabel(segment.mode)}</span>
        {/if}
    </span>
{:else if item.type === "stay"}
    {@const stay = item.stay}
    <span class="inline-flex flex-wrap items-center gap-1.5 align-middle">
        <LocationLink
            location={stay.location}
            fallbackName={stay.name?.trim() || "未填"}
        />
        {#if stay.address?.trim() && stay.address.trim() !== stay.name?.trim()}
            <span class="text-slate-400">·</span>
            <span class="text-slate-500">{stay.address.trim()}</span>
        {/if}
    </span>
{:else if item.type === "activity"}
    {@const activity = item.activity}
    <span class="inline-flex flex-wrap items-center gap-1.5 align-middle">
        <LocationLink
            location={activity.location}
            fallbackName={activity.name?.trim() || "未填"}
        />
        {#if activity.address?.trim() && activity.address.trim() !== activity.name?.trim()}
            <span class="text-slate-400">·</span>
            <span class="text-slate-500">{activity.address.trim()}</span>
        {/if}
    </span>
{:else if item.type === "meal"}
    {@const meal = item.meal}
    <span class="inline-flex flex-wrap items-center gap-1.5 align-middle">
        <LocationLink
            location={meal.location}
            fallbackName={meal.name?.trim() || "未填"}
        />
        {#if meal.address?.trim() && meal.address.trim() !== meal.name?.trim()}
            <span class="text-slate-400">·</span>
            <span class="text-slate-500">{meal.address.trim()}</span>
        {/if}
    </span>
{:else if item.type === "shopping"}
    {@const shopping = item.shopping}
    <span class="inline-flex flex-wrap items-center gap-1.5 align-middle">
        <LocationLink
            location={shopping.location}
            fallbackName={shopping.name?.trim() || "未填"}
        />
        {#if shopping.address?.trim() && shopping.address.trim() !== shopping.name?.trim()}
            <span class="text-slate-400">·</span>
            <span class="text-slate-500">{shopping.address.trim()}</span>
        {/if}
    </span>
{:else}
    <span>{item.note?.text?.trim() || "（空）"}</span>
{/if}
