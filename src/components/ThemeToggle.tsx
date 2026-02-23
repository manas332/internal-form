'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div className="w-9 h-9 mr-3" />; // Placeholder to avoid layout shift
    }

    const isDark = resolvedTheme === 'dark';

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 mr-3 rounded-lg bg-[#1e1e2e] dark:bg-[#e8e8f0] hover:bg-[#2a2a3e] dark:hover:bg-[#d0d0de] text-white dark:text-[#1e1e2e] transition-all duration-200 flex items-center justify-center shadow-md"
            aria-label="Toggle Dark Mode"
        >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    );
}
