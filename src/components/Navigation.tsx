'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

export default function Navigation() {
    const pathname = usePathname();

    return (
        <nav className="main-nav">
            <div className="nav-container">
                <div className="nav-logo flex items-center gap-2">
                    <ThemeToggle />
                    <Image
                        src="/hp_logo.png"
                        alt="HP Logo"
                        width={120}
                        height={36}
                        style={{ height: '36px', width: 'auto', maxWidth: '120px' }}
                        className="mix-blend-multiply dark:mix-blend-normal object-contain"
                    />
                    <span className="logo-text hidden sm:inline-block">Internal Sales Tool</span>
                </div>
                <div className="nav-links">
                    <Link
                        href="/"
                        className={`nav-link ${pathname === '/' ? 'active' : ''}`}
                    >
                        Create Order
                    </Link>
                    <Link
                        href="/schedule-order"
                        className={`nav-link ${pathname === '/schedule-order' ? 'active' : ''}`}
                    >
                        Schedule Order
                    </Link>
                    <Link
                        href="/tracking"
                        className={`nav-link ${pathname === '/tracking' ? 'active' : ''}`}
                    >
                        Track Orders
                    </Link>
                    <Link
                        href="/grievance"
                        className={`nav-link ${pathname === '/grievance' ? 'active' : ''}`}
                    >
                        Grievances
                    </Link>
                    <Link
                        href="/admin"
                        className={`nav-link ${pathname === '/admin' ? 'active' : ''}`}
                    >
                        Admin
                    </Link>
                </div>
            </div>
        </nav>
    );
}
