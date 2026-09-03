
import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Vehicle, LogEntry, Order, OrderStatus } from '../types';
import { api } from '../api';
import { getTodayDate } from '../utils';

interface FleetContextType {
    vehicles: Vehicle[];
    logs: LogEntry[]; // Contains ACTIVE tasks only for Dashboard
    orders: Order[];
    loading: boolean;
    error: string | null;
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
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
    deleteOrder: (id: string) => Promise<boolean>;
}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

export const FleetProvider = ({ children }: { children?: ReactNode }) => {
    const queryClient = useQueryClient();

    // 1. Vehicles Query
    const vehiclesQuery = useQuery({
        queryKey: ['vehicles'],
        queryFn: () => api.get('/vehicles'),
        initialData: []
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
        initialData: []
    });

    // 3. Orders Query
    const ordersQuery = useQuery({
        queryKey: ['orders'],
        queryFn: () => api.get('/orders'),
        initialData: []
    });

    const loading = vehiclesQuery.isLoading || logsQuery.isLoading || ordersQuery.isLoading;
    const error = (vehiclesQuery.error || logsQuery.error || ordersQuery.error) ? "Fehler beim Laden" : null;

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
            queryClient.invalidateQueries({ queryKey: ['analysis'] });
        }
    });

    const coupleMutation = useMutation({
        mutationFn: async ({m, t}: any) => {
            const motor = vehiclesQuery.data.find((v:any) => v.id === m);
            const trailer = vehiclesQuery.data.find((v:any) => v.id === t);
            if(motor && trailer) {
                await Promise.all([
                    api.put(`/vehicles/${motor.id}`, { ...motor, coupledVehicleId: trailer.id }),
                    api.put(`/vehicles/${trailer.id}`, { ...trailer, coupledVehicleId: motor.id })
                ]);
            }
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    });

    const uncoupleMutation = useMutation({
        mutationFn: async ({m, t}: any) => {
            const motor = vehiclesQuery.data.find((v:any) => v.id === m);
            if(motor) await api.put(`/vehicles/${motor.id}`, { ...motor, coupledVehicleId: null });
            if(t) {
                const trailer = vehiclesQuery.data.find((v:any) => v.id === t);
                if(trailer) await api.put(`/vehicles/${trailer.id}`, { ...trailer, coupledVehicleId: null });
            }
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
            queryClient.invalidateQueries({ queryKey: ['analysis'] }); // Analysis might need update
        }
    });

    const deleteLogMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/logs/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs'] });
            queryClient.invalidateQueries({ queryKey: ['history'] });
            queryClient.invalidateQueries({ queryKey: ['analysis'] });
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
            queryClient.invalidateQueries({ queryKey: ['analysis'] }); // Updates Analysis View
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
            queryClient.invalidateQueries({ queryKey: ['analysis'] });
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


    // WRAPPERS to match old Interface
    const saveVehicle = async (v: Vehicle) => { try { await vehicleMutation.mutateAsync(v); return true; } catch { return false; } };
    const deleteVehicle = async (id: string) => { if(!confirm('Löschen?')) return false; try { await deleteVehicleMutation.mutateAsync(id); return true; } catch { return false; } };
    const coupleVehicles = async (m: string, t: string) => { await coupleMutation.mutateAsync({m, t}); };
    const uncoupleVehicles = async (m: string, t?: string) => { await uncoupleMutation.mutateAsync({m, t}); };
    
    const saveLogEntry = async (e: any[]) => { try { await saveLogMutation.mutateAsync(e); return true; } catch { return false; } };
    const updateLogStatus = async (log: LogEntry, s: 'OPEN' | 'IN_PROGRESS' | 'EXTERNAL' | 'DONE') => { try { await saveLogMutation.mutateAsync([{...log, status: s}]); } catch {} };
    const deleteLog = async (id: string) => { if(!confirm('Löschen?')) return false; try { await deleteLogMutation.mutateAsync(id); return true; } catch { return false; } };
    const completeTask = async (log: LogEntry, m: number, notes?: string) => { try { await completeTaskMutation.mutateAsync({log, mileage: m, notes}); return true; } catch { return false; } };
    const completeInspection = async (log: LogEntry, n: string) => { try { await completeInspectionMutation.mutateAsync({log, nextDate: n}); return true; } catch { return false; } };

    const saveOrder = async (o: any[]) => { try { await saveOrderMutation.mutateAsync(o); return true; } catch { return false; } };
    const deleteOrder = async (id: string) => { if(!confirm('Löschen?')) return false; try { await deleteOrderMutation.mutateAsync(id); return true; } catch { return false; } };
    const updateOrderStatus = async (id: string, s: OrderStatus, supplier?: string) => { try { await statusOrderMutation.mutateAsync({id, status: s, supplier}); } catch {} };

    return (
        <FleetContext.Provider value={{
            vehicles: vehiclesQuery.data as Vehicle[],
            logs: logsQuery.data as LogEntry[], // Only ACTIVE logs!
            orders: ordersQuery.data as Order[],
            loading, error, refetchAll,
            saveVehicle, deleteVehicle, coupleVehicles, uncoupleVehicles,
            saveLogEntry, updateLogStatus, deleteLog, completeTask, completeInspection,
            saveOrder, updateOrderStatus, deleteOrder
        }}>
            {children}
        </FleetContext.Provider>
    );
};

export const useFleet = () => {
    const context = useContext(FleetContext);
    if (context === undefined) throw new Error('useFleet must be used within a FleetProvider');
    return context;
};
