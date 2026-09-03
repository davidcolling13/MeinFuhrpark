
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useFleet } from '../context/FleetContext';
import { Vehicle, LogEntry } from '../types';
import { getPrioritySortValue, getVehicleTypePriority, generateVirtualInspections } from '../utils';

// --- HOOK: Appointments / Planning Logic ---
export const useVehicleAppointments = (selectedMonth: string) => {
    const { vehicles } = useFleet();
    const safeVehicles = Array.isArray(vehicles) ? vehicles.filter(v => v.isActive !== false) : [];

    const appointments = useMemo(() => {
        const list: any[] = [];
        safeVehicles.forEach((v: Vehicle) => {
            if (v.nextHU) list.push({ id: v.id + 'HU', vid: v.id, license: v.licensePlate, vehicleType: v.type, inspectionType: 'HU', date: v.nextHU });
            if (v.nextSP) list.push({ id: v.id + 'SP', vid: v.id, license: v.licensePlate, vehicleType: v.type, inspectionType: 'SP', date: v.nextSP });
            if (v.nextUVV) list.push({ id: v.id + 'UVV', vid: v.id, license: v.licensePlate, vehicleType: v.type, inspectionType: 'UVV', date: v.nextUVV });
            if (v.nextTacho) list.push({ id: v.id + 'Tacho', vid: v.id, license: v.licensePlate, vehicleType: v.type, inspectionType: 'Tacho', date: v.nextTacho });
        });
        return list.sort((a, b) => {
            const [ma, ya] = a.date.split('/'); const [mb, yb] = b.date.split('/');
            return new Date(parseInt(ya), parseInt(ma) - 1).getTime() - new Date(parseInt(yb), parseInt(mb) - 1).getTime();
        });
    }, [safeVehicles]);

    const { overdue, dueThisMonth, upcomingGrouped } = useMemo(() => {
        const ov: any[] = [], curr: any[] = [], up: any[] = [];
        appointments.forEach(apt => {
            const [m, y] = apt.date.split('/');
            const aptIso = `${y}-${m.padStart(2, '0')}`;
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

// --- HOOK: Analysis / Statistics Logic ---
export const useFleetAnalysis = (selectedYear: number, timeRange: string, selectedType: string) => {
    const { vehicles } = useFleet();
    const allVehicles = Array.isArray(vehicles) ? vehicles : [];

    // Fetch all completed logs for analysis
    const { data: completedLogs = [] } = useQuery({
        queryKey: ['logs', 'completed'],
        queryFn: async () => {
            const res = await api.get('/logs?status=DONE');
            console.log("API response for /logs?status=DONE:", res);
            // Handle paginated response structure if backend returns it
            const data = res.data || res;
            return Array.isArray(data) ? data : [];
        }
    });

    const analysisData = useMemo(() => {
        console.log("Analysis Data Memo Triggered", { completedLogs, selectedYear, timeRange, selectedType });
        // Helper to check range
        const checkRange = (date: Date) => {
            const m = date.getMonth(); // 0-11
            if (timeRange === 'YEAR') return true;
            if (timeRange === 'Q1') return m >= 0 && m <= 2;
            if (timeRange === 'Q2') return m >= 3 && m <= 5;
            if (timeRange === 'Q3') return m >= 6 && m <= 8;
            if (timeRange === 'Q4') return m >= 9 && m <= 11;
            return m === parseInt(timeRange);
        };

        const parseDateRobust = (dateStr: any) => {
            if (!dateStr) return new Date(NaN);
            if (typeof dateStr === 'number') return new Date(dateStr);
            if (typeof dateStr !== 'string') return new Date(NaN);
            
            // Remove time component if present for robust parsing
            const dateOnly = dateStr.split('T')[0].split(' ')[0];
            
            // Explicitly check for DD.MM.YYYY or DD/MM/YYYY FIRST to prevent browser from guessing MM.DD.YYYY
            if (dateOnly.includes('.')) {
                const parts = dateOnly.split('.');
                if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else if (dateOnly.includes('/')) {
                const parts = dateOnly.split('/');
                if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            }
            
            let d = new Date(dateOnly);
            return d;
        };

        const filtered = (completedLogs || []).filter((l: LogEntry) => {
            if (l.status !== 'DONE') return false;
            
            let vehicle = null;
            if (l.vehicleId) {
                vehicle = allVehicles.find((v: Vehicle) => v.id === l.vehicleId);
                // We don't exclude logs for deleted vehicles if we want to keep historical data,
                // but if the vehicle is completely gone from the DB, we might still want to count it as "Allgemein" or "Gelöscht".
                // Let's just allow it.
            }

            const dateToUse = l.dateCompleted || l.dateAdded;
            if (!dateToUse) return false;
            const completionDate = parseDateRobust(dateToUse);
            if (isNaN(completionDate.getTime())) return false;
            if (completionDate.getFullYear() !== selectedYear) return false;
            if (!checkRange(completionDate)) return false;
            
            if (selectedType) {
                if (!vehicle) return false; // Exclude general/deleted logs if filtering by type
                if (vehicle.type !== selectedType) return false;
            }
            
            return true;
        });
        console.log("Filtered Logs:", filtered);

        const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
        const monthlyData = months.map((m) => ({ label: m, value: 0 }));

        filtered.forEach((l: LogEntry) => {
            const dateToUse = l.dateCompleted || l.dateAdded;
            if (!dateToUse) return;
            const d = parseDateRobust(dateToUse);
            if (isNaN(d.getTime())) return;
            const mIdx = d.getMonth();
            if (monthlyData[mIdx]) monthlyData[mIdx].value++;
        });

        const vehicleCounts: Record<string, number> = {};
        filtered.forEach((l: LogEntry) => {
            if (l.vehicleId) vehicleCounts[l.vehicleId] = (vehicleCounts[l.vehicleId] || 0) + 1;
        });

        const topVehicles = Object.entries(vehicleCounts)
            .map(([vid, count]) => {
                const v = allVehicles.find((vh: Vehicle) => vh.id === vid);
                return {
                    id: vid,
                    count,
                    license: v?.licensePlate || 'Gelöschtes Fahrzeug',
                    model: v ? `${v.manufacturer} ${v.model}` : '',
                    type: v?.type
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const categoryCounts: Record<string, number> = { 'Wartung': 0, 'Reparatur': 0, 'Prüfung': 0 };
        filtered.forEach((l: LogEntry) => {
            if (l.inspectionType) categoryCounts['Prüfung']++;
            else if (l.type === 'Wartung') categoryCounts['Wartung']++;
            else categoryCounts['Reparatur']++;
        });
        const categoryData = Object.entries(categoryCounts).map(([k, v]) => ({ label: k, value: v }));

        return { total: filtered.length, monthlyData, topVehicles, categoryData };

    }, [completedLogs, allVehicles, selectedYear, selectedType, timeRange]);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        years.add(new Date().getFullYear());
        
        const parseDateRobust = (dateStr: any) => {
            if (!dateStr) return new Date(NaN);
            if (typeof dateStr === 'number') return new Date(dateStr);
            if (typeof dateStr !== 'string') return new Date(NaN);
            
            // Remove time component if present for robust parsing
            const dateOnly = dateStr.split('T')[0].split(' ')[0];
            
            // Explicitly check for DD.MM.YYYY or DD/MM/YYYY FIRST to prevent browser from guessing MM.DD.YYYY
            if (dateOnly.includes('.')) {
                const parts = dateOnly.split('.');
                if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else if (dateOnly.includes('/')) {
                const parts = dateOnly.split('/');
                if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            }
            
            let d = new Date(dateOnly);
            return d;
        };

        (completedLogs || []).forEach((l: LogEntry) => {
            const dateToUse = l.dateCompleted || l.dateAdded;
            if (dateToUse) {
                const d = parseDateRobust(dateToUse);
                if (!isNaN(d.getTime())) years.add(d.getFullYear());
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [completedLogs]);

    return { analysisData, availableYears };
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
                const statusOrder: any = { 'IN_PROGRESS': 0, 'OPEN': 1, 'DONE': 2 };
                if (a.status !== b.status) return statusOrder[a.status] - statusOrder[b.status];
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
