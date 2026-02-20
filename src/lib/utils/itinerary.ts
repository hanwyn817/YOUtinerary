import type {
  ActivityInfo,
  DayItem,
  DayItemType,
  DayNote,
  ItineraryDay,
  MealInfo,
  ShoppingInfo,
  StayInfo,
  TransportInfo,
  TransportMode
} from '../types';

export function uid(prefix = ''): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyDay(order: number): ItineraryDay {
  return {
    id: uid('day_'),
    label: `第${order}天`,
    items: []
  };
}

export function createTransport(mode: TransportMode = 'other'): TransportInfo {
  return {
    id: uid('transport_'),
    from: '',
    departTime: '',
    to: '',
    arriveTime: '',
    mode,
    route: '',
    memo: ''
  };
}

export function createStay(): StayInfo {
  return {
    id: uid('stay_'),
    name: '',
    address: '',
    memo: ''
  };
}

export function createActivity(): ActivityInfo {
  return {
    id: uid('activity_'),
    name: '',
    address: '',
    memo: ''
  };
}

export function createMeal(): MealInfo {
  return {
    id: uid('meal_'),
    name: '',
    address: '',
    memo: ''
  };
}

export function createShopping(): ShoppingInfo {
  return {
    id: uid('shopping_'),
    name: '',
    address: '',
    memo: ''
  };
}

export function createNote(): DayNote {
  return {
    id: uid('note_'),
    text: ''
  };
}

export function createDayItem(type: DayItemType): DayItem {
  if (type === 'transport') {
    return { id: uid('item_'), type, transport: createTransport() };
  }
  if (type === 'stay') {
    return { id: uid('item_'), type, stay: createStay() };
  }
  if (type === 'activity') {
    return { id: uid('item_'), type, activity: createActivity() };
  }
  if (type === 'meal') {
    return { id: uid('item_'), type, meal: createMeal() };
  }
  if (type === 'shopping') {
    return { id: uid('item_'), type, shopping: createShopping() };
  }
  return { id: uid('item_'), type, note: createNote() };
}
