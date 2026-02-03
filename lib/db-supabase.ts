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
        await supabase.from('buys').upsert(buy, { onConflict: 'tx_hash,post_token,buyer' });
    },
    insertBuys: async (buys: { buyer: string, post_token: string, block_time: string, tx_hash: string }[]) => {
        if (!supabase || buys.length === 0) return { error: null };
        return await supabase.from('buys').upsert(buys, { onConflict: 'tx_hash,post_token,buyer' });
    },

    // Identities (Step 1 Reset)
    getIdentity: async (address: string) => {
        if (!supabase) return null;
        const { data } = await supabase.from('identities').select('*').eq('address', address.toLowerCase()).single();
        return data;
    },
    getIdentities: async (addresses: string[]) => {
        if (!supabase || addresses.length === 0) return [];
        const { data } = await supabase.from('identities').select('*').in('address', addresses.map(a => a.toLowerCase()));
        return data || [];
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
    },

    getActivityFeed: async (address: string = '', limit = 50) => {
        if (!supabase) return [];
        let query = supabase.from('buys').select('*').order('block_time', { ascending: false }).limit(limit);
        if (address) query = query.eq('buyer', address.toLowerCase());
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    getAddressByName: async (name: string): Promise<string | null> => {
        if (!supabase) return null;
        const nameLower = name.toLowerCase();
        const { data } = await supabase
            .from('identities')
            .select('address')
            .or(`base_name.ilike.${nameLower},farcaster_username.ilike.${nameLower}`)
            .single();
        return data ? data.address : null;
    },

    getProfileStats: async (address: string) => {
        if (!supabase) return null;
        const addressLower = address.toLowerCase();

        const { data, error } = await supabase
            .from('buys')
            .select('block_time, post_token')
            .eq('buyer', addressLower);

        if (error || !data) return null;

        const uniquePosts = new Set(data.map(b => b.post_token));
        const times = data.map(b => new Date(b.block_time).getTime());

        return {
            total_buys: data.length,
            unique_posts: uniquePosts.size,
            first_buy: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
            last_buy: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null
        };
    },

    getProfileHoldings: async (address: string) => {
        if (!supabase) return [];
        const { data } = await supabase
            .from('holdings')
            .select('*')
            .eq('wallet', address.toLowerCase());
        return data || [];
    }
};
