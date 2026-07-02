import ScheduleOrderFlow from '@/components/ScheduleOrderFlow';
import DTDCExportButton from '@/components/DTDCExportButton';
import DTDCOuterSheetButton from '@/components/DTDCOuterSheetButton';
import ShadowfaxExportButton from '@/components/ShadowfaxExportButton';
import ShadowfaxOuterSheetButton from '@/components/ShadowfaxOuterSheetButton';
import SyncDailyOrdersButton from '@/components/SyncDailyOrdersButton';

export default function ScheduleOrderPage() {
    return (
        <div className="app-container">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Schedule Order</h1>
                <div className="flex gap-3">
                    <SyncDailyOrdersButton />
                    <DTDCExportButton />
                    <DTDCOuterSheetButton />
                    <ShadowfaxExportButton />
                    <ShadowfaxOuterSheetButton />
                </div>
            </div>
            <ScheduleOrderFlow />
        </div>
    );
}
