<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let visible = false;
  export let unlocking = false;
  export let error: string | null = null;

  const dispatch = createEventDispatcher<{ unlocked: string; cancel: void }>();

  let password = '';
  let show = visible;

  $: show = visible;

  function submit() {
    if (!password) return;
    dispatch('unlocked', password);
  }

  function close() {
    password = '';
    dispatch('cancel');
  }
</script>

{#if show}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
    <div class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl shadow-sky-100">
      <h2 class="text-xl font-semibold text-slate-800">输入密码以解锁编辑</h2>
      <p class="mt-2 text-sm text-slate-500">为了避免陌生人滥用，请输入你设置的管理密码。</p>
      <form
        class="mt-6 flex flex-col gap-4"
        on:submit|preventDefault={submit}
      >
        <label class="flex flex-col gap-2 text-sm text-slate-600">
          <span>管理密码</span>
          <input
            type="password"
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
            bind:value={password}
            required
            autocomplete="current-password"
          />
        </label>
        {#if error}
          <p class="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
        {/if}
        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300 hover:text-slate-800"
            on:click={close}
          >
            取消
          </button>
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 hover:from-sky-400 hover:via-sky-300 hover:to-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={unlocking}
          >
            {unlocking ? '验证中…' : '解锁'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
