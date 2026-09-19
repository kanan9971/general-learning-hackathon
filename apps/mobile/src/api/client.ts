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

async function request<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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

// ---- RAG tutor ----
export type Citation = {
  source_id: string;
  title: string;
  publisher: string;
  url?: string | null;
  chunk_id?: string | null;
  section_path?: string | null;
  excerpt?: string | null;
  content_type?: string | null;
};

export type TutorLesson = {
  lesson: {
    concept_id: string;
    level: string;
    sections: { kind: 'supported' | 'synthesis' | 'assumption' | 'uncertainty'; heading: string; text: string; source_ids: string[] }[];
    check_question: string;
    insufficient_evidence?: boolean;
  };
  citations: Citation[];
  follow_up: string;
  generated_by?: 'llm' | 'fallback';
};

export const getTutorLesson = (
  req: { concept_id: string; level?: string; misconception?: string; question?: string },
  token?: string,
) => request<TutorLesson>('/v1/tutor/lesson', token, req);
