
import { createContext, useContext, ReactNode, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Vehicle, LogEntry, Order, OrderStatus } from '../types';
import { api } from '../api';
import { getTodayDate } from '../utils';
import { ModalOverlay } from '../components/Common';

interface FleetContextType {
    vehicles: Vehicle[];
    logs: LogEntry[]; // Contains ACTIVE tasks only for Dashboard
    orders: Order[];
    loading: boolean;
    refetchAll: () => void;
    
    saveVehicle: (v: Vehicle) => Promise<boolean>;
    deleteVehicle: (id: string) => Promise<boolean>;
    coupleVehicles: (motorId: string, trailerId: string) => Promise<void>;
    uncoupleVehicles: (motorId: string, trailerId?: string) => Promise<void>;
    
    saveLogEntry: (entries: any[]) => Promise<boolean>;
    updateLogStatus: (log: LogEntry, newStatus: 'OPEN' | 'IN_PROGRESS' | 'EXTERNAL' | 'DONE') => Promise<void>;
    deleteLog: (id: string) => Promise<boolean>;
    completeTask: (log: LogEntry, mileage: number, notes?: string) => Promise<boolean>;
    completeInspection: (log: LogEntry, nextDate: string) => Promise<boolean>;
    
    saveOrder: (ordersList: any[]) => Promise<boolean>;
    updateOrderStatus: (id: string, status: OrderStatus, supplier?: string) => Promise<void>;
    deleteOrder: (id: string) => Promise<boolean>;
}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

export const FleetProvider = ({ children }: { children?: ReactNode }) => {
    const queryClient = useQueryClient();

    // 1. Vehicles Query
    const vehiclesQuery = useQuery({
        queryKey: ['vehicles'],
        queryFn: () => api.get('/vehicles'),
        initialData: [],
        initialDataUpdatedAt: 0
    });

    // 2. Active Logs Query (Optimized for Dashboard)
    // We only fetch status != DONE to keep the payload small
    const logsQuery = useQuery({
        queryKey: ['logs', 'active'],
        queryFn: async () => {
            const res = await api.get('/logs?status=!DONE');
            // If API returns paginated structure, extract data. Else assume array.
            return res.data || res || []; 
        },
        initialData: [],
        initialDataUpdatedAt: 0
    });

    // 3. Orders Query
    const ordersQuery = useQuery({
        queryKey: ['orders'],
        queryFn: () => api.get('/orders'),
        initialData: [],
        initialDataUpdatedAt: 0
    });

    const loading = vehiclesQuery.isLoading || logsQuery.isLoading || ordersQuery.isLoading;

    const refetchAll = () => {
        queryClient.invalidateQueries();
    };

    // --- MUTATIONS ---

    const vehicleMutation = useMutation({
        mutationFn: (v: Vehicle) => v.id && vehiclesQuery.data.find((x:any) => x.id === v.id) ? api.put(`/vehicles/${v.id}`, v) : api.post('/vehicles', v),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    });

    const deleteVehicleMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/vehicles/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            queryClient.invalidateQueries({ queryKey: ['logs'] }); // Cascade delete affects logs
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['history'] });
        }
    });

    const coupleMutation = useMutation({
        mutationFn: async ({m, t}: { m: string; t: string }) => {
            await api.post('/transaction/couple', { motorId: m, trailerId: t });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    });

    const uncoupleMutation = useMutation({
        mutationFn: async ({m, t}: { m: string; t?: string }) => {
            await api.post('/transaction/uncouple', { motorId: m, trailerId: t });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    });

    // Logs Mutations
    const saveLogMutation = useMutation({
        mutationFn: async (entries: any[]) => {
             const promises = entries.map(entry => {
                const sanitized = { ...entry, type: entry.type === 'Aufgabe' ? 'Reparatur' : entry.type };
                if(sanitized.id) return api.put(`/logs/${sanitized.id}`, sanitized);
                return api.post('/logs', sanitized);
            });
            await Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs'] });
            queryClient.invalidateQueries({ queryKey: ['history'] });
        }
    });

    const deleteLogMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/logs/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs'] });
            queryClient.invalidateQueries({ queryKey: ['history'] });
        }
    });

    const completeTaskMutation = useMutation({
        mutationFn: async ({log, mileage, notes}: any) => {
             const updatedLog = { ...log, status: 'DONE', dateCompleted: getTodayDate(), mileage, notes };
             await api.post('/transaction/complete-task', { logId: log.id, vehicleId: log.vehicleId, mileage, logData: updatedLog });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs'] }); // Removes from Active List
            queryClient.invalidateQueries({ queryKey: ['vehicles'] }); // Updates mileage
            queryClient.invalidateQueries({ queryKey: ['history'] }); // Updates History View
        }
    });

    const completeInspectionMutation = useMutation({
        mutationFn: async ({log, nextDate}: any) => {
             const logData = { vehicleId: log.vehicleId, description: `${log.inspectionType} Prüfung durchgeführt`, dateAdded: getTodayDate(), dateCompleted: getTodayDate(), inspectionType: log.inspectionType };
             await api.post('/transaction/complete-inspection', { logData, nextDate });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs'] });
            queryClient.invalidateQueries({ queryKey: ['vehicles'] }); // Updates next date
            queryClient.invalidateQueries({ queryKey: ['history'] });
        }
    });

    // Orders Mutations
    const saveOrderMutation = useMutation({
        mutationFn: async (orders: any[]) => {
             const promises = orders.map(o => o.id && ordersQuery.data.find((x:any) => x.id === o.id) ? api.put(`/orders/${o.id}`, o) : api.post('/orders', o));
             await Promise.all(promises);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] })
    });
    
    const deleteOrderMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/orders/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] })
    });
    
    const statusOrderMutation = useMutation({
        mutationFn: async ({id, status, supplier}: any) => {
            const order = ordersQuery.data.find((o:any) => o.id === id);
            if(order) {
                const payload = { ...order, status };
                if (supplier !== undefined) payload.supplier = supplier;
                await api.put(`/orders/${id}`, payload);
            }
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] })
    });


    // In-app confirmation modal replacing native window.confirm (blocked in iframes)
    const [confirmState, setConfirmState] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
    const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

    const requestConfirm = (message: string) => {
        return new Promise<boolean>((resolve) => {
            confirmResolverRef.current = resolve;
            setConfirmState({ open: true, message });
        });
    };

    const resolveConfirm = (confirmed: boolean) => {
        setConfirmState({ open: false, message: '' });
        if (confirmResolverRef.current) {
            confirmResolverRef.current(confirmed);
            confirmResolverRef.current = null;
        }
    };

    // WRAPPERS to match old Interface with user-visible error feedback
    const showMutationError = (action: string, err: any) => {
        if (err?.status === 409) {
            queryClient.invalidateQueries();
            toast.error(err.message || 'Konflikt: Daten wurden zwischenzeitlich geändert und neu geladen.');
            return;
        }
        toast.error(`${action}: ${err?.message || 'Unbekannter Fehler'}`);
    };

    const saveVehicle = async (v: Vehicle) => { try { await vehicleMutation.mutateAsync(v); return true; } catch (e) { showMutationError('Fahrzeug speichern fehlgeschlagen', e); return false; } };
    const deleteVehicle = async (id: string) => { if(!(await requestConfirm('Fahrzeug inklusive zugehöriger Historie und Bestellungen wirklich löschen?'))) return false; try { await deleteVehicleMutation.mutateAsync(id); return true; } catch (e) { showMutationError('Fahrzeug löschen fehlgeschlagen', e); return false; } };
    const coupleVehicles = async (m: string, t: string) => { try { await coupleMutation.mutateAsync({m, t}); } catch (e) { showMutationError('Gespann koppeln fehlgeschlagen', e); } };
    const uncoupleVehicles = async (m: string, t?: string) => { try { await uncoupleMutation.mutateAsync({m, t}); } catch (e) { showMutationError('Gespann trennen fehlgeschlagen', e); } };
    
    const saveLogEntry = async (e: any[]) => { try { await saveLogMutation.mutateAsync(e); return true; } catch (err) { showMutationError('Auftrag speichern fehlgeschlagen', err); return false; } };
    const updateLogStatus = async (log: LogEntry, s: 'OPEN' | 'IN_PROGRESS' | 'EXTERNAL' | 'DONE') => { try { await saveLogMutation.mutateAsync([{...log, status: s}]); } catch (e) { showMutationError('Status-Änderung fehlgeschlagen', e); } };
    const deleteLog = async (id: string) => { if(!(await requestConfirm('Diesen Eintrag wirklich löschen?'))) return false; try { await deleteLogMutation.mutateAsync(id); return true; } catch (e) { showMutationError('Eintrag löschen fehlgeschlagen', e); return false; } };
    const completeTask = async (log: LogEntry, m: number, notes?: string) => { try { await completeTaskMutation.mutateAsync({log, mileage: m, notes}); return true; } catch (e) { showMutationError('Aufgabe abschließen fehlgeschlagen', e); return false; } };
    const completeInspection = async (log: LogEntry, n: string) => { try { await completeInspectionMutation.mutateAsync({log, nextDate: n}); return true; } catch (e) { showMutationError('Prüfung abschließen fehlgeschlagen', e); return false; } };

    const saveOrder = async (o: any[]) => { try { await saveOrderMutation.mutateAsync(o); return true; } catch (e) { showMutationError('Bestellung speichern fehlgeschlagen', e); return false; } };
    const deleteOrder = async (id: string) => { if(!(await requestConfirm('Diese Bestellung wirklich löschen?'))) return false; try { await deleteOrderMutation.mutateAsync(id); return true; } catch (e) { showMutationError('Bestellung löschen fehlgeschlagen', e); return false; } };
    const updateOrderStatus = async (id: string, s: OrderStatus, supplier?: string) => { try { await statusOrderMutation.mutateAsync({id, status: s, supplier}); } catch (e) { showMutationError('Bestellstatus ändern fehlgeschlagen', e); } };

    return (
        <FleetContext.Provider value={{
            vehicles: vehiclesQuery.data as Vehicle[],
            logs: logsQuery.data as LogEntry[], // Only ACTIVE logs!
            orders: ordersQuery.data as Order[],
            loading, refetchAll,
            saveVehicle, deleteVehicle, coupleVehicles, uncoupleVehicles,
            saveLogEntry, updateLogStatus, deleteLog, completeTask, completeInspection,
            saveOrder, updateOrderStatus, deleteOrder
        }}>
            {children}
            <ModalOverlay isOpen={confirmState.open} onClose={() => resolveConfirm(false)} maxWidth="max-w-sm">
                <div className="p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-2">Löschen bestätigen</h3>
                    <p className="text-sm text-gray-600 mb-6">{confirmState.message}</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => resolveConfirm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium text-sm">Abbrechen</button>
                        <button onClick={() => resolveConfirm(true)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-sm shadow-sm">Löschen</button>
                    </div>
                </div>
            </ModalOverlay>
        </FleetContext.Provider>
    );
};

export const useFleet = () => {
    const context = useContext(FleetContext);
    if (context === undefined) throw new Error('useFleet must be used within a FleetProvider');
    return context;
};
