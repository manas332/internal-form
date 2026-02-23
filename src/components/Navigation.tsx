'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
    const pathname = usePathname();

    return (
        <nav className="main-nav">
            <div className="nav-container">
                <div className="nav-logo">
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-accent"
                    >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                    <span className="logo-text">Internal Sales Tool</span>
                </div>
                <div className="nav-links">
                    <Link
                        href="/"
                        className={`nav-link ${pathname === '/' ? 'active' : ''}`}
                    >
                        Create Order
                    </Link>
                    <Link
                        href="/tracking"
                        className={`nav-link ${pathname === '/tracking' ? 'active' : ''}`}
                    >
                        Track Orders
                    </Link>
                </div>
            </div>
        </nav>
    );
}
