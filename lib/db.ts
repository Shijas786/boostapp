import { dbSqlite } from './db-sqlite';
import { dbSupabase } from './db-supabase';

const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

// Force switch log
if (useSupabase) {
    console.log('🔌 Using Supabase Backend');
} else {
    console.log('📂 Using Local SQLite Backend');
}

export const db = useSupabase ? dbSupabase : dbSqlite;
