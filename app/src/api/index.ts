import { demoApi } from './demo';
import { createSupabaseApi } from './supabase';
import type { Api } from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// With Supabase keys in .env the app talks to the real backend; without them it runs the demo.
export const supabaseApi = url && key ? createSupabaseApi(url, key) : null;
export const api: Api = supabaseApi ?? demoApi;
export * from './types';
