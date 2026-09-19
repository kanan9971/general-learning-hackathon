// Thin API client. Types will be generated from the backend OpenAPI (scripts/gen_types.sh).
import Constants from 'expo-constants';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:8000';

export type DataMode = 'live' | 'cache' | 'demo';

export type Health = {
  status: 'ok' | 'degraded';
  data_mode: DataMode;
  version: string;
  checks: Record<string, boolean>;
};

export class ApiError extends Error {
  constructor(public code: string, message: string, public retryable: boolean) {
    super(message);
  }
}

async function request<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.code ?? 'http_error', body.message ?? res.statusText, !!body.retryable);
  }
  return res.json() as Promise<T>;
}

export const getHealth = () => request<Health>('/health');
// Phase 0 only: canned responses so screens can be built before real routes exist.
export const getFixture = <T>(name: string) => request<T>(`/v1/dev/fixtures/${name}`);
