
import { useMemo } from 'react';
import { useFleet } from '../context/FleetContext';
import { Vehicle, LogEntry } from '../types';
import { getPrioritySortValue, getVehicleTypePriority, generateVirtualInspections, parseMMYYYYParts, parseDateMMYYYY } from '../utils';

// --- HOOK: Appointments / Planning Logic ---
export const useVehicleAppointments = (selectedMonth: string) => {
    const { vehicles } = useFleet();
    const safeVehicles = Array.isArray(vehicles) ? vehicles.filter(v => v.isActive !== false) : [];

    const appointments = useMemo(() => {
        const list: any[] = [];
        const addIfValid = (v: Vehicle, inspectionType: 'HU' | 'SP' | 'UVV' | 'Tacho', date?: string) => {
            if (!date || !parseMMYYYYParts(date)) return;
            list.push({ id: v.id + inspectionType, vid: v.id, license: v.licensePlate, vehicleType: v.type, inspectionType, date });
        };
        safeVehicles.forEach((v: Vehicle) => {
            addIfValid(v, 'HU', v.nextHU);
            addIfValid(v, 'SP', v.nextSP);
            addIfValid(v, 'UVV', v.nextUVV);
            addIfValid(v, 'Tacho', v.nextTacho);
        });
        return list.sort((a, b) => parseDateMMYYYY(a.date) - parseDateMMYYYY(b.date));
    }, [safeVehicles]);

    const { overdue, dueThisMonth, upcomingGrouped } = useMemo(() => {
        const ov: any[] = [], curr: any[] = [], up: any[] = [];
        appointments.forEach(apt => {
            const parsed = parseMMYYYYParts(apt.date);
            if (!parsed) return;
            const aptIso = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
            if (aptIso < selectedMonth) ov.push({ ...apt, isOverdue: true });
            else if (aptIso === selectedMonth) curr.push({ ...apt, isOverdue: false });
            else up.push(apt);
        });
        const groups: Record<string, any[]> = {};
        up.forEach(apt => { if (!groups[apt.date]) groups[apt.date] = []; groups[apt.date].push(apt); });
        return { overdue: ov, dueThisMonth: curr, upcomingGrouped: groups };
    }, [appointments, selectedMonth]);

    return { overdue, dueThisMonth, upcomingGrouped };
};

// --- HOOK: Dashboard Logic ---
export const useDashboardLogic = (
    showCoupled: boolean,
    sortMode: 'priority' | 'type' | 'license', 
    filters: { licensePlate: string, type: string, priority: string, category: string }
) => {
    const { logs, vehicles } = useFleet();
    const safeVehicles = Array.isArray(vehicles) ? vehicles.filter(v => v.isActive !== false) : [];
    
    const generatedInspections: LogEntry[] = useMemo(() => generateVirtualInspections(safeVehicles), [safeVehicles]);

    const filteredLogs = useMemo(() => {
        const allItems = [...logs, ...generatedInspections];
        return allItems.filter((l: LogEntry) => {
            if (l.status === 'DONE') return false;
            
            // If the log is attached to a vehicle, but the vehicle is not in safeVehicles (e.g. inactive), hide it
            if (l.vehicleId && !safeVehicles.some(v => v.id === l.vehicleId)) return false;

            const vehicle = safeVehicles.find((v: Vehicle) => v.id === l.vehicleId);
            const licensePlate = vehicle?.licensePlate || 'Allgemein';
            const type = vehicle?.type || 'Sonstige';

            if (filters.licensePlate && !licensePlate.toLowerCase().includes(filters.licensePlate.toLowerCase())) return false;

            if (filters.type) {
                const matchesType = type === filters.type;
                let matchesCoupledContext = false;
                if (showCoupled) {
                    let partnerId = vehicle?.coupledVehicleId;
                    if (!partnerId) {
                        const pointingVehicle = safeVehicles.find((v: Vehicle) => v.coupledVehicleId === vehicle?.id);
                        if (pointingVehicle) {
                            partnerId = pointingVehicle.id;
                        }
                    }
                    if (partnerId) {
                        const partner = safeVehicles.find((v: Vehicle) => v.id === partnerId);
                        if (partner && partner.type === filters.type) {
                            matchesCoupledContext = true;
                        }
                    }
                }
                if (!matchesType && !matchesCoupledContext) return false;
            }

            if (filters.priority && l.priority !== filters.priority) return false;

            if (filters.category === 'inspection') {
                if (!l.isVirtual && !l.inspectionType && l.type !== 'Prüfung') return false;
            }
            if (filters.category === 'work') {
                if (l.isVirtual || l.inspectionType || l.type === 'Prüfung') return false;
            }

            return true;
        });
    }, [logs, generatedInspections, safeVehicles, filters, showCoupled]);

    const groupedLogs = useMemo(() => {
        const groups: { [key: string]: LogEntry[] } = {};
        filteredLogs.forEach((log: LogEntry) => {
            const key = log.vehicleId || 'unknown';
            if (!groups[key]) groups[key] = [];
            groups[key].push(log);
        });
        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => {
                const statusOrder: Record<string, number> = { 'IN_PROGRESS': 0, 'EXTERNAL': 1, 'OPEN': 2, 'DONE': 3 };
                const orderA = statusOrder[a.status] ?? 99;
                const orderB = statusOrder[b.status] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                const pA = getPrioritySortValue(a.priority);
                const pB = getPrioritySortValue(b.priority);
                if (pA !== pB) return pA - pB;
                return a.dateAdded.localeCompare(b.dateAdded);
            });
        });
        return groups;
    }, [filteredLogs]);

    const sortedGroupKeys = useMemo(() => {
        const keys = Object.keys(groupedLogs);
        return keys.sort((a, b) => {
            const hasInProgressA = groupedLogs[a].some(l => l.status === 'IN_PROGRESS') ? 0 : 1;
            const hasInProgressB = groupedLogs[b].some(l => l.status === 'IN_PROGRESS') ? 0 : 1;
            
            if (hasInProgressA !== hasInProgressB) return hasInProgressA - hasInProgressB;

            const vA = safeVehicles.find((v: Vehicle) => v.id === a);
            const vB = safeVehicles.find((v: Vehicle) => v.id === b);
            if (sortMode === 'priority') {
                const minPrio = (tasks: LogEntry[]) => tasks.length === 0 ? 99 : Math.min(...tasks.map(t => getPrioritySortValue(t.priority)));
                const pA = minPrio(groupedLogs[a]), pB = minPrio(groupedLogs[b]);
                if (pA !== pB) return pA - pB;
                return (vA?.licensePlate || 'ZZ').localeCompare(vB?.licensePlate || 'ZZ');
            } else if (sortMode === 'type') {
                const pA = getVehicleTypePriority(vA?.type || 'Sonstige'), pB = getVehicleTypePriority(vB?.type || 'Sonstige');
                if (pA !== pB) return pA - pB;
                return (vA?.licensePlate || 'ZZ').localeCompare(vB?.licensePlate || 'ZZ');
            } else {
                return (vA?.licensePlate || 'ZZ').localeCompare(vB?.licensePlate || 'ZZ');
            }
        });
    }, [groupedLogs, safeVehicles, sortMode]);

    return { sortedGroupKeys, groupedLogs, safeVehicles };
};
