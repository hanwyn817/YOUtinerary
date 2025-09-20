export type CurrencyCode = 'CNY' | 'USD' | 'JPY' | 'HKD' | 'EUR' | 'GBP' | 'AUD' | 'TWD' | 'KRW' | 'THB' | 'OTHER';

export type TransportMode =
  | 'plane'
  | 'train'
  | 'high-speed-rail'
  | 'bus'
  | 'car'
  | 'subway'
  | 'ferry'
  | 'taxi'
  | 'rideshare'
  | 'bike'
  | 'walk'
  | 'other';

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface LocationPoint {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  adcode?: string;
}

export interface TransportInfo {
  id: string;
  from: string;
  departTime: string;
  to: string;
  arriveTime: string;
  mode: TransportMode;
  route: string;
  cost?: Money;
  memo?: string;
  provider?: string;
  bookingCode?: string;
  fromLocation?: LocationPoint;
  toLocation?: LocationPoint;
}

export interface StayInfo {
  id: string;
  name: string;
  address: string;
  checkInTime?: string;
  checkOutTime?: string;
  cost?: Money;
  memo?: string;
  confirmationNumber?: string;
  location?: LocationPoint;
}

export interface ActivityInfo {
  id: string;
  name: string;
  address: string;
  startTime?: string;
  endTime?: string;
  cost?: Money;
  memo?: string;
  bookingCode?: string;
  location?: LocationPoint;
}

export interface DayNote {
  id: string;
  text: string;
}

export type DayItemType = 'transport' | 'stay' | 'activity' | 'note';

export type DayItem =
  | { id: string; type: 'transport'; transport: TransportInfo }
  | { id: string; type: 'stay'; stay: StayInfo }
  | { id: string; type: 'activity'; activity: ActivityInfo }
  | { id: string; type: 'note'; note: DayNote };

export interface ItineraryDay {
  id: string;
  label: string; // e.g. "第1天"
  date?: string; // optional actual date
  items: DayItem[];
}

export interface CostSummary {
  transport: number;
  stay: number;
  activities: number;
  others: number;
  currency: CurrencyCode;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'link';
  url: string;
  description?: string;
}

export interface ItineraryMeta {
  id: string;
  title: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  startLabel?: string;
  endLabel?: string;
  coverImage?: string;
}

export interface Itinerary extends ItineraryMeta {
  description?: string;
  days: ItineraryDay[];
  totalBudget?: CostSummary;
  attachments: Attachment[];
  baseCurrency?: CurrencyCode;
}

export interface UnlockRequest {
  password: string;
}

export interface UnlockResponse {
  ok: boolean;
  token?: string;
  error?: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface ApiListResponse<T> {
  items: T[];
  nextCursor?: string;
}

export interface ApiSingleResponse<T> {
  item: T;
}

export type EditableEntity =
  | { kind: 'transport'; dayId: string; itemId: string }
  | { kind: 'stay'; dayId: string; itemId: string }
  | { kind: 'activity'; dayId: string; itemId: string }
  | { kind: 'note'; dayId: string; itemId: string };
