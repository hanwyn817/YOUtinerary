import type { DayItem, DayItemType, TransportMode } from '../types';

export const DAY_ITEM_LABELS: Record<DayItemType, string> = {
  transport: '交通',
  activity: '游玩',
  stay: '住宿',
  note: '备注'
};

export const DAY_ITEM_OPTIONS = (['transport', 'activity', 'stay', 'note'] as DayItemType[]).map(
  (value) => ({ value, label: DAY_ITEM_LABELS[value] })
);

export function getDayItemLabel(type: DayItemType): string {
  return DAY_ITEM_LABELS[type] ?? type;
}

const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  plane: '飞机',
  train: '火车',
  'high-speed-rail': '高铁/城际',
  bus: '长途/大巴',
  subway: '地铁',
  car: '自驾/租车',
  taxi: '出租/网约',
  rideshare: '拼车/顺风',
  ferry: '轮渡',
  bike: '骑行',
  walk: '步行',
  other: '其他'
};

export function getTransportModeLabel(mode: TransportMode | undefined): string {
  return (mode && TRANSPORT_MODE_LABELS[mode]) || TRANSPORT_MODE_LABELS.other;
}

export function summarizeDayItem(item: DayItem): string {
  switch (item.type) {
    case 'transport': {
      const segment = item.transport;
      const parts = [
        [segment.from || '未填', segment.to || '未填'].join(' → '),
        segment.route?.trim()
      ].filter(Boolean);
      return parts.join(' · ') || getTransportModeLabel(segment.mode);
    }
    case 'stay': {
      const stay = item.stay;
      const parts = [stay.name?.trim() || '未填', stay.address?.trim()].filter(Boolean);
      return parts.join(' · ') || '未填';
    }
    case 'activity': {
      const activity = item.activity;
      const parts = [activity.name?.trim() || '未填', activity.address?.trim()].filter(Boolean);
      return parts.join(' · ') || '未填';
    }
    case 'note':
    default: {
      const noteText = item.note.text.trim();
      return noteText || '（空）';
    }
  }
}

export function summarizeTime(start?: string | null, end?: string | null, separator = ' - '): string {
  const s = (start ?? '').trim();
  const e = (end ?? '').trim();
  if (!s && !e) return '';
  if (s && e) return `${s}${separator}${e}`;
  return s || e;
}

export function suggestGaodeMode(mode: TransportMode | undefined): 'driving' | 'transit' | 'walking' | 'bicycling' {
  if (mode === 'subway' || mode === 'bus') return 'transit';
  if (mode === 'walk') return 'walking';
  if (mode === 'bike') return 'bicycling';
  return 'driving';
}

export function extractCostDisplay(item: DayItem, fallbackCurrency = 'CNY'): string {
  const cost =
    item.type === 'transport'
      ? item.transport.cost
      : item.type === 'stay'
        ? item.stay.cost
        : item.type === 'activity'
          ? item.activity.cost
          : undefined;
  if (!cost) return '';
  const { amount, currency } = cost;
  if (amount === undefined || amount === null) return '';
  return `${amount}${currency ?? fallbackCurrency}`;
}
