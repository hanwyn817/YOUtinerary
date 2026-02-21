<script lang="ts">
  import { onMount } from "svelte";
  import type { LocationPoint } from "../../lib/types";

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

  interface LocationResult extends LocationPoint {
    id: string;
  }

  let visible = false;
  let payload: LocationRequestPayload | null = null;
  
  let keyword = "";
  let loading = false;
  let results: LocationResult[] = [];
  let errorMsg = "";
  
  // Debounce setup
  let searchTimeout: ReturnType<typeof setTimeout>;

  const openPicker = (event: CustomEvent<LocationRequestPayload>) => {
    payload = event.detail;
    keyword = payload.existing?.name || "";
    results = [];
    errorMsg = "";
    visible = true;
    
    if (keyword) {
      handleSearch();
    }
  };

  const closePicker = () => {
    visible = false;
    payload = null;
    keyword = "";
    results = [];
  };

  const applyLocation = (location: LocationPoint) => {
    if (!payload) return;
    
    window.dispatchEvent(
      new CustomEvent("youtinerary:location-applied", {
        detail: {
          ...payload,
          location,
        },
      })
    );
    
    closePicker();
  };

  const handleSearch = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      if (!keyword.trim()) {
        results = [];
        return;
      }
      
      loading = true;
      errorMsg = "";
      try {
        const url = new URL("/api/gaode/search", window.location.origin);
        url.searchParams.set("keyword", keyword.trim());
        
        const res = await fetch(url.toString(), { credentials: "include" });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "搜索失败，请重试");
        }
        
        const data = await res.json();
        results = data.items || [];
      } catch (err: any) {
        console.error(err);
        errorMsg = err.message || "无法连接到搜索服务";
      } finally {
        loading = false;
      }
    }, 500);
  };

  onMount(() => {
    const handler = (event: Event) => openPicker(event as CustomEvent<LocationRequestPayload>);
    window.addEventListener("youtinerary:location-request", handler);
    return () => {
      window.removeEventListener("youtinerary:location-request", handler);
    };
  });
</script>

{#if visible}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6 text-slate-800">
    <div class="flex h-full max-h-[600px] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-sky-100">
      
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50">
        <h2 class="text-lg font-semibold text-slate-800">搜索并选择地点</h2>
        <button
          type="button"
          class="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          on:click={closePicker}
        >
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <!-- Search Bar -->
      <div class="p-5 border-b border-slate-100">
        <div class="relative">
          <svg
            class="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="输入地点名称、缩写进行搜索..."
            class="w-full rounded-2xl border border-slate-300 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-700 focus:border-sky-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all"
            bind:value={keyword}
            on:input={handleSearch}
            autofocus
          />
        </div>
      </div>

      <!-- Results List -->
      <div class="flex-1 overflow-y-auto bg-white p-3">
        {#if loading}
          <div class="flex h-32 items-center justify-center text-sm text-slate-500">
             <div class="flex items-center gap-2">
                 <svg class="animate-spin h-5 w-5 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                   <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 <span>正在搜索...</span>
             </div>
          </div>
        {:else if errorMsg}
          <div class="flex h-32 flex-col items-center justify-center gap-2 text-sm text-red-500">
             <svg class="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
             </svg>
             <span>{errorMsg}</span>
          </div>
        {:else if results.length === 0}
          <div class="flex h-32 flex-col items-center justify-center text-sm text-slate-400">
            {#if keyword}
              <span>未找到匹配的地点结果</span>
            {:else}
              <span>请输入关键字开始检索</span>
            {/if}
          </div>
        {:else}
          <ul class="flex flex-col gap-2">
            {#each results as res}
              <li>
                <button
                  type="button"
                  class="flex w-full flex-col items-start gap-1 rounded-2xl p-3 text-left transition hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 focus:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  on:click={() => applyLocation({ name: res.name, lat: res.lat, lng: res.lng, address: res.address, adcode: res.adcode })}
                >
                  <span class="font-medium text-slate-800">{res.name}</span>
                  {#if res.address}
                     <span class="text-xs text-slate-500 line-clamp-1">{res.address}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

    </div>
  </div>
{/if}
