<script lang="ts">
    import type { LocationPoint } from "../../lib/types";
    import { getAmapUrl } from "../../lib/utils/schedule";

    export let location: LocationPoint | undefined | null = null;
    export let fallbackName: string = "未填";
    export let showIcon: boolean = true;

    $: url = getAmapUrl(location);
    $: displayName =
        fallbackName && fallbackName !== "未填"
            ? fallbackName
            : location?.name || "未填";
</script>

{#if url}
    <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-500 hover:underline hover:decoration-sky-300 underline-offset-4 transition-colors group"
        title="前往高德地图查看"
    >
        <span>{displayName}</span>
        {#if showIcon}
            <svg
                class="h-3.5 w-3.5 text-sky-500 opacity-70 group-hover:opacity-100 transition-opacity"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
        {/if}
    </a>
{:else}
    <span>{displayName}</span>
{/if}
