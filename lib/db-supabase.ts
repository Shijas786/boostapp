import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export const dbSupabase = {
    // Cursors
    getCursor: async (key: string): Promise<string | null> => {
        if (!supabase) return null;
        const { data } = await supabase.from('cursors').select('value').eq('key', key).single();
        return data ? data.value : null;
    },
    setCursor: async (key: string, value: string) => {
        if (!supabase) return;
        await supabase.from('cursors').upsert({ key, value });
    },

    // Buys
    insertBuy: async (buy: { buyer: string, post_token: string, block_time: string, tx_hash: string }) => {
        if (!supabase) return;
        // Step 1: Insert buy event
        await supabase.from('buys').upsert(buy, { onConflict: 'tx_hash,post_token' });
    },

    // Identities (Step 1 Reset)
    getIdentity: async (address: string) => {
        if (!supabase) return null;
        const { data } = await supabase.from('identities').select('*').eq('address', address.toLowerCase()).single();
        return data;
    },
    saveIdentity: async (identity: any) => {
        if (!supabase) return;
        await supabase.from('identities').upsert({
            ...identity,
            address: identity.address.toLowerCase(),
            updated_at: new Date().toISOString()
        });
    },

    // Leaderboard
    getLeaderboard: async (limit = 20, period: string = '7d') => {
        if (!supabase) return [];
        let days = 7;
        if (period === '1d') days = 1;
        if (period === '30d') days = 30;

        const { data, error } = await supabase.rpc('get_leaderboard', {
            period_days: days,
            limit_count: limit
        });

        if (error) {
            console.error('Supabase Leaderboard Error:', error);
            return [];
        }
        return data || [];
    }
};
