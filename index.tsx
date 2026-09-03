
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Vehicle, LogEntry, Order, Priority } from './types';
import { getTodayDate } from './utils';
import { Toaster } from 'sonner';

// Context & Provider
import { FleetProvider, useFleet } from './context/FleetContext';

// Components
import { ErrorBoundary } from './components/Common';
import { Layout } from './components/Layout';
import { VehicleModal, EntryModal, OrderModal, InspectionModal, CompletionModal } from './components/Modals';

// Views
import { DashboardView } from './views/DashboardView';
import { VehicleListView, CombinationsView } from './views/VehicleView';
import { AppointmentsView, OrdersView } from './views/PlanningView';
import { HistoryView, AdminView } from './views/ReportView';

// Initialize React Query Client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // Data is fresh for 1 minute
            refetchInterval: 1000 * 30, // Background refresh every 30s
            retry: 1,
            refetchOnWindowFocus: true
        }
    }
});

// The Inner App handles UI State (Modals, Routing) but consumes Data from Context
const FleetApp = () => {
    const [view, setView] = useState('dashboard');
    
    // Access Data & Actions via Context
    const { 
        loading, refetchAll, vehicles,
        saveVehicle, saveLogEntry, saveOrder, 
        updateLogStatus, completeTask, completeInspection 
    } = useFleet();

    // Modal UI States
    const [vehicleModal, setVehicleModal] = useState({ open: false, data: null as Vehicle | null });
    const [entryModal, setEntryModal] = useState({ open: false, data: null as LogEntry | null });
    const [orderModal, setOrderModal] = useState({ open: false, data: null as Order | null });
    const [inspectionModal, setInspectionModal] = useState({ open: false, data: null as LogEntry | null });
    const [completionModal, setCompletionModal] = useState({ open: false, data: null as LogEntry | null });

    // Handlers that bridge UI to Data Actions
    const handleStatusUpdate = (log: LogEntry, newStatus: 'IN_PROGRESS' | 'DONE') => {
        if (newStatus === 'DONE') {
            setCompletionModal({ open: true, data: log });
        } else {
            updateLogStatus(log, newStatus);
        }
    };

    const handleInspectionCompletion = async (log: LogEntry, nextDate: string) => {
        const success = await completeInspection(log, nextDate);
        if (success) setInspectionModal({ open: false, data: null });
    };

    const handleTaskCompletion = async (log: LogEntry, mileage: number, notes?: string) => {
        const success = await completeTask(log, mileage, notes);
        if (success) setCompletionModal({ open: false, data: null });
    };

    const handleSaveVehicle = async (v: Vehicle) => {
        const success = await saveVehicle(v);
        if (success) setVehicleModal({ open: false, data: null });
    };

    const handleSaveEntry = async (entries: any[]) => {
        const success = await saveLogEntry(entries);
        if (success) setEntryModal({ open: false, data: null });
    };

    const handleSaveOrder = async (ordersList: any[]) => {
        const success = await saveOrder(ordersList);
        if (success) setOrderModal({ open: false, data: null });
    };

    // Virtual Inspection Helper for View Logic
    const openVirtualInspection = (apt: any) => {
        setInspectionModal({ 
            open: true, 
            data: { 
                id: `virt_${apt.vid}_${apt.inspectionType}`, 
                vehicleId: apt.vid, 
                type: 'Prüfung', 
                description: `${apt.inspectionType} Fällig (${apt.date})`, 
                priority: Priority.NORMAL, 
                dateAdded: getTodayDate(), 
                status: 'OPEN', 
                inspectionType: apt.inspectionType, 
                isVirtual: true 
            } as LogEntry 
        });
    };

    return (
        <Layout currentView={view} setView={setView} onRefresh={refetchAll}>
            <ErrorBoundary>
                {loading ? <div className="flex justify-center items-center h-full text-gray-400">Laden...</div> : (
                    <>
                        {view === 'dashboard' && (
                            <DashboardView 
                                onAdd={() => setEntryModal({open:true, data:null})} 
                                onInspect={(l:any) => setInspectionModal({open: true, data: l})} 
                                onStatusUpdate={handleStatusUpdate} 
                                onEdit={(l:any) => setEntryModal({open:true, data:l})} 
                            />
                        )}
                        {view === 'vehicles' && (
                            <VehicleListView 
                                onAdd={() => setVehicleModal({open:true, data:null})} 
                                onEdit={(v:any) => setVehicleModal({open:true, data:v})} 
                            />
                        )}
                        {view === 'combinations' && <CombinationsView />}
                        {view === 'appointments' && (
                            <AppointmentsView onComplete={openVirtualInspection} />
                        )}
                        {view === 'orders' && (
                            <OrdersView 
                                onAdd={() => setOrderModal({open:true, data:null})} 
                                onEdit={(o:any) => setOrderModal({open:true, data:o})} 
                            />
                        )}
                        {view === 'history' && (
                            <HistoryView onEdit={(l:any) => setEntryModal({open:true, data:l})} />
                        )}
                        {view === 'admin' && <AdminView />}
                    </>
                )}
            </ErrorBoundary>

            {/* Global Modals */}
            <VehicleModal 
                isOpen={vehicleModal.open} 
                onClose={() => setVehicleModal({open:false, data:null})} 
                vehicle={vehicleModal.data} 
                onSave={handleSaveVehicle} 
            />
            <EntryModal 
                isOpen={entryModal.open} 
                onClose={() => setEntryModal({open:false, data:null})} 
                entry={entryModal.data} 
                vehicles={vehicles} 
                onSave={handleSaveEntry} 
            />
            <OrderModal 
                isOpen={orderModal.open} 
                onClose={() => setOrderModal({open:false, data:null})} 
                order={orderModal.data} 
                vehicles={vehicles} 
                onSave={handleSaveOrder} 
            />
            <InspectionModal 
                isOpen={inspectionModal.open} 
                onClose={() => setInspectionModal({open:false, data:null})} 
                log={inspectionModal.data} 
                onSave={handleInspectionCompletion} 
            />
            <CompletionModal 
                isOpen={completionModal.open} 
                onClose={() => setCompletionModal({open:false, data:null})} 
                log={completionModal.data} 
                onConfirm={handleTaskCompletion} 
            />
        </Layout>
    );
};

const App = () => (
    <QueryClientProvider client={queryClient}>
        <FleetProvider>
            <FleetApp />
            <Toaster position="top-right" />
        </FleetProvider>
    </QueryClientProvider>
);

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
