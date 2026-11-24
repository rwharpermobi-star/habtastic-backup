import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * The same Supabase client, without the generated table/RPC types.
 *
 * The generated `types.ts` lags behind the live schema for a few newer tables
 * and RPCs. Code that talks to those used to cast `supabase as any`; this is the
 * same runtime object, typed with Supabase's own default (schema-less) client
 * type instead. No behaviour difference.
 */
export const untypedSupabase = supabase as unknown as SupabaseClient;
