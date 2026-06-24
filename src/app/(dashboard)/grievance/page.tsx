'use client';

import { useState } from 'react';
import GrievanceForm from '@/components/GrievanceForm';
import GrievanceList from '@/components/GrievanceList';

export default function GrievancePage() {
    const [refreshKey, setRefreshKey] = useState(0);

    const handleGrievanceSubmit = () => {
        setRefreshKey(prev => prev + 1);
    };

    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
                    Grievances Dashboard
                </h1>
                <p className="text-gray-500 dark:text-gray-400">Report new issues and track existing grievances</p>
            </div>
            <GrievanceForm onSuccess={handleGrievanceSubmit} />
            <GrievanceList refreshKey={refreshKey} />
        </div>
    );
}
