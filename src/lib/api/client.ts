import type {
  ApiListResponse,
  ApiSingleResponse,
  Itinerary,
  ItineraryMeta,
  UnlockRequest,
  UnlockResponse
} from '../types';

type FetchOptions = RequestInit & { parseJson?: boolean };

async function request<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { parseJson = true, headers, ...rest } = options;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    credentials: 'include',
    ...rest
  });

  if (!res.ok) {
    const body = parseJson ? await res.json().catch(() => ({})) : await res.text();
    const message = typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error: string }).error
      : res.statusText;
    throw new Error(message || `Request failed with status ${res.status}`);
  }

  if (!parseJson) {
    // @ts-expect-error string result
    return res.text();
  }

  return (await res.json()) as T;
}

export async function fetchItineraries(): Promise<ItineraryMeta[]> {
  const data = await request<ApiListResponse<ItineraryMeta>>('/api/itineraries');
  return data.items;
}

export async function fetchItinerariesFull(): Promise<Itinerary[]> {
  const data = await request<ApiListResponse<Itinerary>>('/api/itineraries?full=1');
  return data.items;
}

export async function fetchItinerary(id: string): Promise<Itinerary> {
  const data = await request<ApiSingleResponse<Itinerary>>(`/api/itineraries/${id}`);
  return data.item;
}

export async function createItinerary(payload: Partial<Itinerary>): Promise<Itinerary> {
  const data = await request<ApiSingleResponse<Itinerary>>('/api/itineraries', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.item;
}

export async function updateItinerary(id: string, payload: Partial<Itinerary>): Promise<Itinerary> {
  const data = await request<ApiSingleResponse<Itinerary>>(`/api/itineraries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return data.item;
}

export async function deleteItinerary(id: string): Promise<void> {
  await request<void>(`/api/itineraries/${id}`, {
    method: 'DELETE',
    parseJson: false
  });
}

export async function unlockEditing(payload: UnlockRequest): Promise<UnlockResponse> {
  return await request<UnlockResponse>('/api/auth/unlock', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
