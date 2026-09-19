import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
  '';

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
  '';

let client: SupabaseClient | null = null;
let bootstrapped: Session | null = null;

function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Silent anonymous session for RLS-backed quiz progress. No login UI. */
export async function ensureAnonymousSession(): Promise<Session | null> {
  const sb = getClient();
  if (!sb) {
    bootstrapped = null;
    return null;
  }
  const { data: existing } = await sb.auth.getSession();
  if (existing.session) {
    bootstrapped = existing.session;
    return existing.session;
  }
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.session) {
    bootstrapped = null;
    return null;
  }
  bootstrapped = data.session;
  return data.session;
}

export async function getAccessToken(): Promise<string | undefined> {
  if (bootstrapped?.access_token) return bootstrapped.access_token;
  const sb = getClient();
  if (!sb) return undefined;
  const { data } = await sb.auth.getSession();
  bootstrapped = data.session;
  return data.session?.access_token;
}
