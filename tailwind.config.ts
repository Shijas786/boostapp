import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                sketch: {
                    bg: '#ffffff',
                    text: '#000000',
                    blue: '#1e40af', // slightly darker for contrast on white
                    green: '#15803d',
                    pink: '#be185d',
                    yellow: '#facc15'
                }
            },
            boxShadow: {
                'neo': '4px 4px 0px 0px rgba(0,0,0,1)',
                'neo-sm': '2px 2px 0px 0px rgba(0,0,0,1)',
                'neo-lg': '8px 8px 0px 0px rgba(0,0,0,1)',
            },
            borderRadius: {
                'sketch': '2px 2px 2px 2px', // Rough look simulated
            }
        },
    },
    plugins: [],
};

export default config;
