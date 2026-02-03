import { createClient } from '@supabase/supabase-js';

// Environment variables must be set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseKey)
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
        await supabase.from('buys').upsert(buy, { onConflict: 'tx_hash,post_token' });
    },

    // Names
    getName: async (address: string): Promise<{ name: string | null } | null> => {
        if (!supabase) return null;
        const { data } = await supabase.from('names').select('name').eq('address', address).single();
        return data;
    },
    saveName: async (data: { address: string, name: string | null, source: string }) => {
        if (!supabase) return;
        await supabase.from('names').upsert(data);
    },

    // Leaderboard Query
    getLeaderboard: async (limit = 100, period: string = '7d') => {
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
    },

    // Profile Queries
    getAddressByName: async (name: string): Promise<string | null> => {
        if (!supabase) return null;
        const { data } = await supabase.from('names')
            .select('address')
            .ilike('name', name) // Case insensitive match
            .single();
        return data ? data.address : null;
    },

    getProfileStats: async (address: string) => {
        if (!supabase) return null;

        const { data, error } = await supabase.rpc('get_profile_stats', { check_address: address });

        if (error || !data || data.length === 0) {
            return { total_buys: 0, unique_creators: 0, last_buy_time: null };
        }
        return data[0];
    },

    getActivityFeed: async (address: string, limit = 20) => {
        if (!supabase) return [];
        const { data } = await supabase.from('buys')
            .select('*')
            .eq('buyer', address)
            .order('block_time', { ascending: false })
            .limit(limit);
        return data || [];
    }
};
