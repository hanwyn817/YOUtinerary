globalThis.process ??= {}; globalThis.process.env ??= {};
import { e as createComponent, f as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../../chunks/astro/server_EH_iM6iK.mjs';
import { $ as $$BaseLayout } from '../../chunks/BaseLayout_n5OTxxwO.mjs';
import { n as noop, s as subscribe_to_store, a as run_all, f as fallback, b as attr, e as escape_html, c as bind_props, d as store_get, g as ensure_array_like, u as unsubscribe_stores } from '../../chunks/_@astro-renderers_BlVgbzts.mjs';
export { r as renderers } from '../../chunks/_@astro-renderers_BlVgbzts.mjs';

/** @import { Equals } from '#client' */


/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function safe_not_equal(a, b) {
	return a != a
		? b == b
		: a !== b || (a !== null && typeof a === 'object') || typeof a === 'function';
}

/** @import { Readable, StartStopNotifier, Subscriber, Unsubscriber, Updater, Writable } from '../public.js' */
/** @import { Stores, StoresValues, SubscribeInvalidateTuple } from '../private.js' */

/**
 * @type {Array<SubscribeInvalidateTuple<any> | any>}
 */
const subscriber_queue = [];

/**
 * Creates a `Readable` store that allows reading by subscription.
 *
 * @template T
 * @param {T} [value] initial value
 * @param {StartStopNotifier<T>} [start]
 * @returns {Readable<T>}
 */
function readable(value, start) {
	return {
		subscribe: writable(value, start).subscribe
	};
}

/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 *
 * @template T
 * @param {T} [value] initial value
 * @param {StartStopNotifier<T>} [start]
 * @returns {Writable<T>}
 */
function writable(value, start = noop) {
	/** @type {Unsubscriber | null} */
	let stop = null;

	/** @type {Set<SubscribeInvalidateTuple<T>>} */
	const subscribers = new Set();

	/**
	 * @param {T} new_value
	 * @returns {void}
	 */
	function set(new_value) {
		if (safe_not_equal(value, new_value)) {
			value = new_value;
			if (stop) {
				// store is ready
				const run_queue = !subscriber_queue.length;
				for (const subscriber of subscribers) {
					subscriber[1]();
					subscriber_queue.push(subscriber, value);
				}
				if (run_queue) {
					for (let i = 0; i < subscriber_queue.length; i += 2) {
						subscriber_queue[i][0](subscriber_queue[i + 1]);
					}
					subscriber_queue.length = 0;
				}
			}
		}
	}

	/**
	 * @param {Updater<T>} fn
	 * @returns {void}
	 */
	function update(fn) {
		set(fn(/** @type {T} */ (value)));
	}

	/**
	 * @param {Subscriber<T>} run
	 * @param {() => void} [invalidate]
	 * @returns {Unsubscriber}
	 */
	function subscribe(run, invalidate = noop) {
		/** @type {SubscribeInvalidateTuple<T>} */
		const subscriber = [run, invalidate];
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			stop = start(set, update) || noop;
		}
		run(/** @type {T} */ (value));
		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0 && stop) {
				stop();
				stop = null;
			}
		};
	}
	return { set, update, subscribe };
}

/**
 * Derived value store by synchronizing one or more readable stores and
 * applying an aggregation function over its input values.
 *
 * @template {Stores} S
 * @template T
 * @overload
 * @param {S} stores
 * @param {(values: StoresValues<S>, set: (value: T) => void, update: (fn: Updater<T>) => void) => Unsubscriber | void} fn
 * @param {T} [initial_value]
 * @returns {Readable<T>}
 */
/**
 * Derived value store by synchronizing one or more readable stores and
 * applying an aggregation function over its input values.
 *
 * @template {Stores} S
 * @template T
 * @overload
 * @param {S} stores
 * @param {(values: StoresValues<S>) => T} fn
 * @param {T} [initial_value]
 * @returns {Readable<T>}
 */
/**
 * @template {Stores} S
 * @template T
 * @param {S} stores
 * @param {Function} fn
 * @param {T} [initial_value]
 * @returns {Readable<T>}
 */
function derived(stores, fn, initial_value) {
	const single = !Array.isArray(stores);
	/** @type {Array<Readable<any>>} */
	const stores_array = single ? [stores] : stores;
	if (!stores_array.every(Boolean)) {
		throw new Error('derived() expects stores as input, got a falsy value');
	}
	const auto = fn.length < 2;
	return readable(initial_value, (set, update) => {
		let started = false;
		/** @type {T[]} */
		const values = [];
		let pending = 0;
		let cleanup = noop;
		const sync = () => {
			if (pending) {
				return;
			}
			cleanup();
			const result = fn(single ? values[0] : values, set, update);
			if (auto) {
				set(result);
			} else {
				cleanup = typeof result === 'function' ? result : noop;
			}
		};
		const unsubscribers = stores_array.map((store, i) =>
			subscribe_to_store(
				store,
				(value) => {
					values[i] = value;
					pending &= ~(1 << i);
					if (started) {
						sync();
					}
				},
				() => {
					pending |= 1 << i;
				}
			)
		);
		started = true;
		sync();
		return function stop() {
			run_all(unsubscribers);
			cleanup();
			// We need to set this to false because callbacks can still happen despite having unsubscribed:
			// Callbacks might already be placed in the queue which doesn't know it should no longer
			// invoke this derived store.
			started = false;
		};
	});
}

async function request(url, options = {}) {
  const { parseJson = true, headers, ...rest } = options;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    credentials: "include",
    ...rest
  });
  if (!res.ok) {
    const body = parseJson ? await res.json().catch(() => ({})) : await res.text();
    const message = typeof body === "object" && body !== null && "error" in body ? body.error : res.statusText;
    throw new Error(message || `Request failed with status ${res.status}`);
  }
  if (!parseJson) {
    return res.text();
  }
  return await res.json();
}
async function fetchItineraries() {
  const data = await request("/api/itineraries");
  return data.items;
}
async function fetchItinerary(id) {
  const data = await request(`/api/itineraries/${id}`);
  return data.item;
}
async function createItinerary(payload) {
  const data = await request("/api/itineraries", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.item;
}
async function updateItinerary(id, payload) {
  const data = await request(`/api/itineraries/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return data.item;
}
async function deleteItinerary(id) {
  await request(`/api/itineraries/${id}`, {
    method: "DELETE",
    parseJson: false
  });
}
async function unlockEditing(payload) {
  return await request("/api/auth/unlock", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

const initialState = {
  list: [],
  activeItinerary: null,
  loading: false,
  error: null,
  editingUnlocked: false,
  unlocking: false
};
function createStore() {
  const { subscribe, update} = writable(initialState);
  async function loadList() {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const items = await fetchItineraries();
      update((state) => ({ ...state, list: items, loading: false }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: error.message }));
    }
  }
  async function selectItinerary(id) {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const item = await fetchItinerary(id);
      update((state) => ({ ...state, activeItinerary: item, loading: false }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: error.message }));
    }
  }
  async function createDraft(payload) {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      const created = await createItinerary(payload);
      update((state) => ({
        ...state,
        list: [created, ...state.list],
        activeItinerary: created,
        loading: false
      }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: error.message }));
    }
  }
  async function persistItinerary(id, payload) {
    update((state) => ({ ...state, error: null }));
    try {
      const item = await updateItinerary(id, payload);
      update((state) => ({
        ...state,
        list: state.list.map((it) => it.id === item.id ? item : it),
        activeItinerary: item
      }));
      return true;
    } catch (error) {
      update((state) => ({ ...state, error: error.message }));
      return false;
    }
  }
  async function removeItinerary(id) {
    update((state) => ({ ...state, loading: true, error: null }));
    try {
      await deleteItinerary(id);
      update((state) => ({
        ...state,
        loading: false,
        activeItinerary: state.activeItinerary?.id === id ? null : state.activeItinerary,
        list: state.list.filter((it) => it.id !== id)
      }));
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: error.message }));
    }
  }
  async function unlock(password) {
    update((state) => ({ ...state, unlocking: true, error: null }));
    try {
      const result = await unlockEditing({ password });
      if (result.ok) {
        update((state) => ({ ...state, unlocking: false, editingUnlocked: true }));
      } else {
        update((state) => ({ ...state, unlocking: false, error: result.error ?? "密码错误" }));
      }
      return result;
    } catch (error) {
      const message = error.message || "密码验证失败";
      update((state) => ({ ...state, unlocking: false, error: message }));
      return { ok: false, error: message };
    }
  }
  function clearError() {
    update((state) => ({ ...state, error: null }));
  }
  const hasItineraries = derived({ subscribe }, ($state) => $state.list.length > 0);
  return {
    subscribe,
    loadList,
    selectItinerary,
    createDraft,
    persistItinerary,
    removeItinerary,
    unlock,
    clearError,
    hasItineraries
  };
}
const itineraryStore = createStore();

function PasswordGate($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let visible = fallback($$props['visible'], false);
		let unlocking = fallback($$props['unlocking'], false);
		let error = fallback($$props['error'], null);
		let password = '';
		let show = visible;

		show = visible;

		if (show) {
			$$renderer.push('<!--[-->');
			$$renderer.push(`<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"><div class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl shadow-sky-100"><h2 class="text-xl font-semibold text-slate-800">输入密码以解锁编辑</h2> <p class="mt-2 text-sm text-slate-500">为了避免陌生人滥用，请输入你设置的管理密码。</p> <form class="mt-6 flex flex-col gap-4"><label class="flex flex-col gap-2 text-sm text-slate-600"><span>管理密码</span> <input type="password" class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', password)} required autocomplete="current-password"/></label> `);

			if (error) {
				$$renderer.push('<!--[-->');
				$$renderer.push(`<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">${escape_html(error)}</p>`);
			} else {
				$$renderer.push('<!--[!-->');
			}

			$$renderer.push(`<!--]--> <div class="flex items-center justify-end gap-3"><button type="button" class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300 hover:text-slate-800">取消</button> <button type="submit" class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 hover:from-sky-400 hover:via-sky-300 hover:to-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"${attr('disabled', unlocking, true)}>${escape_html(unlocking ? '验证中…' : '解锁')}</button></div></form></div></div>`);
		} else {
			$$renderer.push('<!--[!-->');
		}

		$$renderer.push(`<!--]-->`);
		bind_props($$props, { visible, unlocking, error });
	});
}

function uid(prefix = "") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}
function createEmptyDay(order) {
  return {
    id: uid("day_"),
    label: `第${order}天`,
    items: []
  };
}

const DAY_ITEM_LABELS = {
  transport: "交通安排",
  activity: "游玩安排",
  stay: "住宿安排",
  note: "备注"
};
const DAY_ITEM_OPTIONS = ["transport", "activity", "stay", "note"].map(
  (value) => ({ value, label: DAY_ITEM_LABELS[value] })
);
function getDayItemLabel(type) {
  return DAY_ITEM_LABELS[type] ?? type;
}

function ItineraryWorkspace($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		let state;

		const transportOptions = [
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

		const currencyOptions = [
			'CNY',
			'JPY',
			'USD',
			'HKD',
			'EUR',
			'GBP',
			'AUD',
			'TWD',
			'KRW',
			'THB',
			'OTHER'
		];

		let draft = null;
		let dirty = false;
		let exporting = false;
		let routingItemId = null;

		function cloneValue(value) {
			if (typeof structuredClone === 'function') {
				return structuredClone(value);
			}

			return JSON.parse(JSON.stringify(value));
		}

		function recalcBudget() {
			if (!draft) return;

			let transport = 0;
			let stay = 0;
			let activities = 0;

			draft.days.forEach((day) => {
				day.items.forEach((item) => {
					const amount = item.type === 'transport'
						? item.transport.cost?.amount
						: item.type === 'stay'
							? item.stay.cost?.amount
							: item.type === 'activity' ? item.activity.cost?.amount : undefined;

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
				totalBudget: { transport, stay, activities, others, currency }
			};
		}

		function typeLabel(type) {
			return getDayItemLabel(type);
		}

		state = store_get($$store_subs ??= {}, '$itineraryStore', itineraryStore);

		if (state.activeItinerary && (!draft || draft.id !== state.activeItinerary.id)) {
			draft = cloneValue(state.activeItinerary);

			if (!draft.baseCurrency) {
				draft.baseCurrency = 'CNY';
			}

			recalcBudget();
			dirty = false;
		}

		if (!draft) {
			$$renderer.push('<!--[-->');
			$$renderer.push(`<div class="flex h-full min-h-[400px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-slate-500"><p class="text-base">请选择左侧的行程查看详情，或点击“新建行程”开始规划。</p></div>`);
		} else {
			$$renderer.push('<!--[!-->');
			$$renderer.push(`<div class="flex flex-col gap-6"><div class="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100"><div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div class="flex flex-1 flex-col gap-4"><label class="flex flex-col gap-2 text-sm text-slate-600">行程标题 <input class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', draft.title)} placeholder="给行程起个名字吧"/></label> <label class="flex flex-col gap-2 text-sm text-slate-600">行程别名（slug） <input class="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', draft.slug)} placeholder="my-next-trip"/></label> <label class="flex flex-col gap-2 text-sm text-slate-600">费用基准货币 `);

			$$renderer.select(
				{
					class: 'rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200',
					value: draft.baseCurrency
				},
				($$renderer) => {
					$$renderer.push(`<!--[-->`);

					const each_array = ensure_array_like(currencyOptions);

					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let option = each_array[$$index];

						$$renderer.option({ value: option }, ($$renderer) => {
							$$renderer.push(`${escape_html(option)}`);
						});
					}

					$$renderer.push(`<!--]-->`);
				}
			);

			$$renderer.push(`</label> <label class="flex flex-col gap-2 text-sm text-slate-600">行程概览 <textarea class="min-h-[120px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="记录旅程亮点、同行伙伴或整体节奏。">`);

			const $$body = escape_html(draft.description);

			if ($$body) {
				$$renderer.push(`${$$body}`);
			}

			$$renderer.push(`</textarea></label></div> <div class="flex flex-shrink-0 flex-col gap-3 text-sm"><button class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-5 py-2 font-semibold text-white shadow-lg shadow-sky-200 hover:from-sky-400 hover:via-sky-300 hover:to-emerald-300 disabled:opacity-60"${attr('disabled', !dirty, true)}>${escape_html(dirty ? '保存行程' : '已保存')}</button> <button class="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-500 disabled:opacity-60"${attr('disabled', exporting, true)}>${escape_html('导出为图片')}</button> <button class="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-slate-500 hover:border-sky-300 hover:text-sky-500">复制行程</button></div></div></div> <div id="itinerary-export" class="flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-xl shadow-sky-100"><header class="flex flex-col gap-2 border-b border-slate-200 pb-4"><h2 class="text-2xl font-semibold text-slate-800">${escape_html(draft.title)}</h2> `);

			if (draft.description) {
				$$renderer.push('<!--[-->');
				$$renderer.push(`<p class="text-sm text-slate-500">${escape_html(draft.description)}</p>`);
			} else {
				$$renderer.push('<!--[!-->');
			}

			$$renderer.push(`<!--]--></header> <section class="rounded-2xl border border-slate-200 bg-sky-50/60 p-4"><h3 class="text-lg font-semibold text-slate-700">费用概览</h3> <div class="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4"><div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"><span class="text-xs text-slate-500">交通</span> <span class="text-base font-semibold text-slate-700">${escape_html(draft.totalBudget?.transport ?? 0)}${escape_html(draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY')}</span></div> <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"><span class="text-xs text-slate-500">住宿</span> <span class="text-base font-semibold text-slate-700">${escape_html(draft.totalBudget?.stay ?? 0)}${escape_html(draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY')}</span></div> <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"><span class="text-xs text-slate-500">游玩</span> <span class="text-base font-semibold text-slate-700">${escape_html(draft.totalBudget?.activities ?? 0)}${escape_html(draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY')}</span></div> <div class="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4"><span class="text-xs text-slate-500">其他</span> <span class="text-base font-semibold text-slate-700">${escape_html(draft.totalBudget?.others ?? 0)}${escape_html(draft.totalBudget?.currency ?? draft.baseCurrency ?? 'CNY')}</span></div></div></section> <!--[-->`);

			const each_array_1 = ensure_array_like(draft.days);

			for (let $$index_5 = 0, $$length = each_array_1.length; $$index_5 < $$length; $$index_5++) {
				let day = each_array_1[$$index_5];

				$$renderer.push(`<section class="rounded-2xl border border-slate-200 bg-slate-100 p-5"><div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><input class="text-xl font-semibold text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', day.label)}/> <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><label class="flex items-center gap-2">日期（可选） <input type="date" class="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-200"${attr('value', day.date ?? '')}/></label> <button class="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">复制当天</button> <button class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-red-500/40 hover:text-red-200">删除当天</button> <div class="flex items-center gap-1"><button class="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">↑</button> <button class="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">↓</button></div></div></div> <button class="self-start rounded-full border border-sky-400 px-3 py-1 text-xs text-sky-600 hover:bg-sky-100">${escape_html('关闭自动标签' )}</button></div> <div class="mt-4 flex flex-col gap-4">`);

				if (day.items.length === 0) {
					$$renderer.push('<!--[-->');
					$$renderer.push(`<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">暂无安排，添加一条交通 / 住宿 / 游玩记录开始吧。</p>`);
				} else {
					$$renderer.push('<!--[!-->');
				}

				$$renderer.push(`<!--]--> <!--[-->`);

				const each_array_2 = ensure_array_like(day.items);

				for (let index = 0, $$length = each_array_2.length; index < $$length; index++) {
					let entry = each_array_2[index];

					$$renderer.push(`<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div class="flex items-center gap-2 text-xs text-slate-500"><span class="rounded-full border border-sky-200 px-2 py-0.5 text-sky-600">${escape_html(typeLabel(entry.type))}</span> <span class="text-slate-500">#${escape_html(index + 1)}</span></div> <div class="flex items-center gap-2 text-xs"><button class="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-sky-300 hover:text-sky-500">上移</button> <button class="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-sky-300 hover:text-sky-500">下移</button> <button class="rounded-full border border-slate-200 px-3 py-1 text-slate-500 hover:border-red-300 hover:text-red-400">删除</button></div></div> `);

					if (entry.type === 'transport') {
						$$renderer.push('<!--[-->');
						$$renderer.push(`<div class="mt-3 flex flex-col gap-3"><div class="grid gap-3 sm:grid-cols-2"><label class="flex flex-col gap-1 text-xs text-slate-600">出发地 <div class="flex gap-2"><input class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.transport.from)}/> <button type="button" class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">选地点</button></div></label> <label class="flex flex-col gap-1 text-xs text-slate-600">到达地 <div class="flex gap-2"><input class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.transport.to)}/> <button type="button" class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">选地点</button></div></label></div> <div class="grid gap-3 sm:grid-cols-4"><label class="flex flex-col gap-1 text-xs text-slate-600">出发时间 <input type="time" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.transport.departTime)}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">到达时间 <input type="time" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.transport.arriveTime)}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">交通方式 `);

						$$renderer.select(
							{
								class: 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200',
								value: entry.transport.mode
							},
							($$renderer) => {
								$$renderer.push(`<!--[-->`);

								const each_array_3 = ensure_array_like(transportOptions);

								for (let $$index_1 = 0, $$length = each_array_3.length; $$index_1 < $$length; $$index_1++) {
									let option = each_array_3[$$index_1];

									$$renderer.option({ value: option.value }, ($$renderer) => {
										$$renderer.push(`${escape_html(option.label)}`);
									});
								}

								$$renderer.push(`<!--]-->`);
							}
						);

						$$renderer.push(`</label> <label class="flex flex-col gap-1 text-xs text-slate-600">班次/路线 <input class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.transport.route)}/></label></div> <div class="grid gap-3 sm:grid-cols-4"><label class="flex flex-col gap-1 text-xs text-slate-600">费用 <input type="number" min="0" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.transport.cost?.amount ?? '')}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">费用货币 `);

						$$renderer.select(
							{
								class: 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200',
								value: entry.transport.cost?.currency ?? draft?.baseCurrency ?? 'CNY'
							},
							($$renderer) => {
								$$renderer.push(`<!--[-->`);

								const each_array_4 = ensure_array_like(currencyOptions);

								for (let $$index_2 = 0, $$length = each_array_4.length; $$index_2 < $$length; $$index_2++) {
									let option = each_array_4[$$index_2];

									$$renderer.option({ value: option }, ($$renderer) => {
										$$renderer.push(`${escape_html(option)}`);
									});
								}

								$$renderer.push(`<!--]-->`);
							}
						);

						$$renderer.push(`</label> <div class="sm:col-span-2 flex items-center justify-end"><button class="rounded-full border border-sky-400 px-3 py-1 text-xs text-sky-600 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"${attr('disabled', routingItemId === entry.id, true)}>${escape_html(routingItemId === entry.id ? '获取路线中…' : '高德路线建议')}</button></div></div> <label class="flex flex-col gap-1 text-xs text-slate-600">备注 <textarea class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('rows', 2)}>`);

						const $$body_1 = escape_html(entry.transport.memo);

						if ($$body_1) {
							$$renderer.push(`${$$body_1}`);
						}

						$$renderer.push(`</textarea></label></div>`);
					} else {
						$$renderer.push('<!--[!-->');

						if (entry.type === 'stay') {
							$$renderer.push('<!--[-->');
							$$renderer.push(`<div class="mt-3 flex flex-col gap-3"><div class="grid gap-3 md:grid-cols-2"><label class="flex flex-col gap-1 text-xs text-slate-600">住宿地点 <div class="flex gap-2"><input class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.stay.name)}/> <button type="button" class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">选地点</button></div></label> <label class="flex flex-col gap-1 text-xs text-slate-600">地址 <input class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.stay.address)}/></label></div> <div class="grid gap-3 md:grid-cols-3"><label class="flex flex-col gap-1 text-xs text-slate-600">入住时间 <input type="time" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.stay.checkInTime)}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">退房时间 <input type="time" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.stay.checkOutTime)}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">费用 <input type="number" min="0" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.stay.cost?.amount ?? '')}/></label></div> <label class="flex flex-col gap-1 text-xs text-slate-600">备注 <textarea class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('rows', 2)}>`);

							const $$body_2 = escape_html(entry.stay.memo);

							if ($$body_2) {
								$$renderer.push(`${$$body_2}`);
							}

							$$renderer.push(`</textarea></label></div>`);
						} else {
							$$renderer.push('<!--[!-->');

							if (entry.type === 'activity') {
								$$renderer.push('<!--[-->');
								$$renderer.push(`<div class="mt-3 flex flex-col gap-3"><div class="grid gap-3 md:grid-cols-2"><label class="flex flex-col gap-1 text-xs text-slate-600">游玩地点 <div class="flex gap-2"><input class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.activity.name)}/> <button type="button" class="whitespace-nowrap rounded-full border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">选地点</button></div></label> <label class="flex flex-col gap-1 text-xs text-slate-600">地址 <input class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.activity.address)}/></label></div> <div class="grid gap-3 md:grid-cols-3"><label class="flex flex-col gap-1 text-xs text-slate-600">开始时间 <input type="time" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.activity.startTime)}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">结束时间 <input type="time" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.activity.endTime)}/></label> <label class="flex flex-col gap-1 text-xs text-slate-600">费用 <input type="number" min="0" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('value', entry.activity.cost?.amount ?? '')}/></label></div> <label class="flex flex-col gap-1 text-xs text-slate-600">备注 <textarea class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('rows', 2)}>`);

								const $$body_3 = escape_html(entry.activity.memo);

								if ($$body_3) {
									$$renderer.push(`${$$body_3}`);
								}

								$$renderer.push(`</textarea></label></div>`);
							} else {
								$$renderer.push('<!--[!-->');
								$$renderer.push(`<label class="mt-3 flex flex-col gap-1 text-xs text-slate-600">备注内容 <textarea class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"${attr('rows', 2)}>`);

								const $$body_4 = escape_html(entry.note.text);

								if ($$body_4) {
									$$renderer.push(`${$$body_4}`);
								}

								$$renderer.push(`</textarea></label>`);
							}

							$$renderer.push(`<!--]-->`);
						}

						$$renderer.push(`<!--]-->`);
					}

					$$renderer.push(`<!--]--></div>`);
				}

				$$renderer.push(`<!--]--> <div class="flex flex-wrap gap-2"><!--[-->`);

				const each_array_5 = ensure_array_like(DAY_ITEM_OPTIONS);

				for (let $$index_4 = 0, $$length = each_array_5.length; $$index_4 < $$length; $$index_4++) {
					let option = each_array_5[$$index_4];

					$$renderer.push(`<button class="rounded-full border border-slate-300 px-4 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-500">添加${escape_html(option.label)}</button>`);
				}

				$$renderer.push(`<!--]--></div></div></section>`);
			}

			$$renderer.push(`<!--]--> <button class="self-start rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-100">添加新的一天</button></div></div>`);
		}

		$$renderer.push(`<!--]-->`);

		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}

function ItineraryEditor($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		let state, active;
		let itineraryId = $$props['itineraryId'];
		let requestedUnlock = false;
		let newDraftInitialized = false;

		function initializeNewDraft() {
			if (newDraftInitialized) return;

			newDraftInitialized = true;

			const now = new Date();

			itineraryStore.createDraft(createTemplate(now));
		}

		function createTemplate(now) {
			return {
				title: '未命名行程',
				slug: `trip-${now.getTime()}`,
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
				baseCurrency: 'CNY',
				description: '',
				days: [createEmptyDay(1)],
				attachments: [],

				totalBudget: {
					transport: 0,
					stay: 0,
					activities: 0,
					others: 0,
					currency: 'CNY'
				}
			};
		}

		state = store_get($$store_subs ??= {}, '$itineraryStore', itineraryStore);
		active = state.activeItinerary;

		if (itineraryId === 'new' && state.editingUnlocked && !newDraftInitialized) {
			initializeNewDraft();
		}

		if (itineraryId === 'new' && newDraftInitialized && active?.id && typeof window !== 'undefined') {
			if (window.location.pathname !== `/itinerary/${active.id}`) {
				window.history.replaceState({}, '', `/itinerary/${active.id}`);
			}
		}

		$$renderer.push(`<div class="flex flex-col gap-6"><div class="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-sky-100 sm:flex-row sm:items-center sm:justify-between"><div class="flex flex-col gap-2"><a href="/" class="text-xs text-sky-600 hover:text-sky-500">← 返回总览</a> <h1 class="text-2xl font-semibold text-slate-800">`);

		if (active) {
			$$renderer.push('<!--[-->');
			$$renderer.push(`编辑：${escape_html(active.title)}`);
		} else {
			$$renderer.push('<!--[!-->');

			if (itineraryId === 'new') {
				$$renderer.push('<!--[-->');
				$$renderer.push(`新建行程草稿`);
			} else {
				$$renderer.push('<!--[!-->');
				$$renderer.push(`加载中...`);
			}

			$$renderer.push(`<!--]-->`);
		}

		$$renderer.push(`<!--]--></h1> `);

		if (active?.description) {
			$$renderer.push('<!--[-->');
			$$renderer.push(`<p class="text-sm text-slate-500">${escape_html(active.description)}</p>`);
		} else {
			$$renderer.push('<!--[!-->');
		}

		$$renderer.push(`<!--]--></div> <div class="flex flex-wrap gap-3">`);

		if (!state.editingUnlocked) {
			$$renderer.push('<!--[-->');
			$$renderer.push(`<button class="inline-flex items-center justify-center rounded-full border border-sky-400 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-100">解锁编辑</button>`);
		} else {
			$$renderer.push('<!--[!-->');
		}

		$$renderer.push(`<!--]--> <a${attr('href', `/itinerary/${active?.id ?? itineraryId}`)} class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-sky-400 hover:text-sky-500">刷新</a></div></div> `);

		if (state.loading && !active) {
			$$renderer.push('<!--[-->');
			$$renderer.push(`<div class="flex min-h-[300px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">正在加载行程详情...</div>`);
		} else {
			$$renderer.push('<!--[!-->');

			if (active) {
				$$renderer.push('<!--[-->');
				ItineraryWorkspace($$renderer);
			} else {
				$$renderer.push('<!--[!-->');
				$$renderer.push(`<div class="flex min-h-[200px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">暂无可编辑的行程，请先解锁或新建。</div>`);
			}

			$$renderer.push(`<!--]-->`);
		}

		$$renderer.push(`<!--]--> `);

		PasswordGate($$renderer, {
			visible: requestedUnlock,
			unlocking: state.unlocking,
			error: state.error
		});

		$$renderer.push(`<!----></div>`);

		if ($$store_subs) unsubscribe_stores($$store_subs);

		bind_props($$props, { itineraryId });
	});
}

const $$Astro = createAstro();
const prerender = false;
const $$id = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$id;
  const { id } = Astro2.params;
  const pageTitle = id === "new" ? "\u65B0\u5EFA\u884C\u7A0B \xB7 YOUtinerary" : `\u7F16\u8F91\u884C\u7A0B \xB7 YOUtinerary`;
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": pageTitle }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="mx-auto mt-6 max-w-6xl px-4 pb-16 sm:px-6 lg:px-8"> ${renderComponent($$result2, "ItineraryEditor", ItineraryEditor, { "client:load": true, "itineraryId": id, "client:component-hydration": "load", "client:component-path": "/Users/hanwyn/Project/YOUtinerary/src/components/itinerary/ItineraryEditor.svelte", "client:component-export": "default" })} </section> ` })}`;
}, "/Users/hanwyn/Project/YOUtinerary/src/pages/itinerary/[id].astro", void 0);

const $$file = "/Users/hanwyn/Project/YOUtinerary/src/pages/itinerary/[id].astro";
const $$url = "/itinerary/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$id,
	file: $$file,
	prerender,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
