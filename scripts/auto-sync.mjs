import { spawn } from 'child_process';
import path from 'path';

const SCRIPTS = [
    { name: 'Sync Tokens', path: 'populate-tokens-from-zora.mjs', frequency: 12 }, // Every 60 mins (12 * 5)
    { name: 'Fetch Transfers', path: 'fetch-all-transfers-24h.mjs', frequency: 1 }, // Every 5 mins
    { name: 'Resolve Identities', path: 'resolve-everything.mjs', frequency: 1 },  // Every 5 mins
    { name: 'Flag Bots', path: 'flag-contracts.mjs', frequency: 1 }               // Every 5 mins
];

let tick = 0;

function runScript(scriptPath) {
    return new Promise((resolve) => {
        console.log(`\n[${new Date().toLocaleTimeString()}] 🚀 Running: ${scriptPath}`);
        const child = spawn('node', [path.join('scripts', scriptPath)], {
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code !== 0) console.error(`   ❌ ${scriptPath} exited with code ${code}`);
            resolve();
        });
    });
}

async function loop() {
    console.log(`\n--- Loop Tick ${tick} [${new Date().toLocaleTimeString()}] ---`);

    for (const script of SCRIPTS) {
        if (tick % script.frequency === 0) {
            console.log(`▶️ Starting ${script.name}...`);
            await runScript(script.path);
            console.log(`✅ Finished ${script.name}`);
        }
    }

    tick++;
    console.log(`\n😴 Sleeping for 5 minutes...`);
    setTimeout(loop, 5 * 60 * 1000);
}

console.log('🌟 HubNation Auto-Sync Engine Started');
console.log('------------------------------------');
loop();
