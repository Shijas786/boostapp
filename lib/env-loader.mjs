import fs from 'fs';

export function getEnv() {
    const env = {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
        CDP_API_SECRET: process.env.CDP_API_SECRET,
        NEYNAR_API_KEY: process.env.NEYNAR_API_KEY,
        NEXT_PUBLIC_ZORA_API_KEY: process.env.NEXT_PUBLIC_ZORA_API_KEY,
        NEXT_PUBLIC_ONCHAINKIT_API_KEY: process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY
    };

    if (fs.existsSync('.env.local')) {
        const envFile = fs.readFileSync('.env.local', 'utf8');
        envFile.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const [k, ...v] = trimmed.split('=');
            if (k && v.length) env[k.trim()] = v.join('=').trim();
        });
    }

    return env;
}
