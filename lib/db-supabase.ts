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
            address: identity.address.toLowerCase(),
            base_name: identity.baseName || identity.base_name,
            ens: identity.ensName || identity.ens,
            farcaster_username: identity.farcasterUsername || identity.farcaster_username,
            farcaster_fid: identity.farcasterFid || identity.farcaster_fid,
            avatar_url: identity.avatarUrl || identity.avatar_url,
            updated_at: new Date().toISOString()
        });
    },

    // Leaderboard
    getLeaderboard: async (limit = 20, period: string = '7d') => {
        if (!supabase) return [];
        let days = 7;
        if (period === '1d') days = 1;
        if (period === '30d') days = 30;

        // Fetch extra rows to account for filtered bots/contracts
        const { data, error } = await supabase.rpc('get_leaderboard', {
            period_days: days,
            limit_count: 5000 // Fetch deep to find humans
        });

        if (error) {
            console.error('Supabase Leaderboard Error:', error);
            return [];
        }

        // Filter for "real humans" (Verified identities only)
        const filtered = (data || [])
            .filter((r: any) => {
                const isBot = (name: string) => name && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('contract'));
                if (isBot(r.ens_name) || isBot(r.base_name)) return false;

                const isRealBaseName = r.base_name && r.base_name.length > 5 && !r.base_name.startsWith('0x');
                const isRealFarcaster = r.farcaster_username && r.farcaster_username.length > 2 && !r.farcaster_username.startsWith('0x');
                const isRealENS = r.ens_name && r.ens_name.includes('.') && !r.ens_name.startsWith('0x');

                return isRealBaseName || isRealFarcaster || isRealENS;
            }).slice(0, limit);

        return filtered;
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
    },

    getTrackedTokens: async () => {
        if (!supabase) return [];
        const { data } = await supabase.from('tracked_tokens').select('address');
        return (data || []).map(t => t.address.toLowerCase());
    }
};
