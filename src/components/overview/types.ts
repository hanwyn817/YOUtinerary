import type { DayItemType, DayItem } from '../../lib/types';

export interface TableRow {
  id: string;
  dayLabel: string;
  date?: string;
  type: DayItemType;
  typeLabel: string;
  summary: string;
  item: DayItem;
  time: string;
  cost: string;
  modeLabel?: string;
}

export interface DayBucket {
  key: string;
  label: string;
  date?: string;
  rows: TableRow[];
}
