import type { DayItemType } from '../../lib/types';

export interface TableRow {
  id: string;
  dayLabel: string;
  date?: string;
  type: DayItemType;
  typeLabel: string;
  summary: string;
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
