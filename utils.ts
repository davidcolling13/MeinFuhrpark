
import { Vehicle, Priority, VehicleType, LogEntry } from './types';

export const getTodayDate = () => new Date().toISOString().split('T')[0];

// Robust ID Generation (UUID v4)
export const generateUUID = () => {
    // Modern Browsers / Node
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback (RFC4122 compliant)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Convert "MM/YYYY" (Storage) to "YYYY-MM" (Input type="month")
export const toInputFormat = (dateStr?: string) => {
    if (!dateStr) return '';
    const [m, y] = dateStr.split('/');
    if (!m || !y) return '';
    return `${y}-${m}`;
};

// Convert "YYYY-MM" (Input type="month") to "MM/YYYY" (Storage)
export const fromInputFormat = (dateStr: string) => {
    if (!dateStr) return '';
    let y, m;
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts[0].length === 4) {
            y = parts[0];
            m = parts[1];
        } else {
            m = parts[0];
            y = parts[1];
        }
    } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        m = parts[0];
        y = parts[1];
    } else if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        m = parts[0];
        y = parts[1];
    } else if (dateStr.length === 4 && !isNaN(Number(dateStr))) {
        m = dateStr.substring(0, 2);
        y = dateStr.substring(2, 4);
    } else if (dateStr.length === 6 && !isNaN(Number(dateStr))) {
        m = dateStr.substring(0, 2);
        y = dateStr.substring(2, 6);
    } else {
        return dateStr;
    }
    if (m) m = m.padStart(2, '0');
    if (y && y.length === 2) y = '20' + y;
    return `${m}/${y}`;
};

export const parseDateMMYYYY = (dateStr?: string) => {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    if (parts.length < 2) return 0;
    const [m, y] = parts;
    if (!m || !y) return 0;
    const date = new Date(parseInt(y), parseInt(m)-1);
    if (isNaN(date.getTime())) return 0; // Robustness Fix
    return date.getTime();
};

export const formatDateFullMonth = (dateStr?: string) => {
    if (!dateStr) return '';
    const [m, y] = dateStr.split('/');
    if (!m || !y) return dateStr;
    const date = new Date(parseInt(y), parseInt(m)-1);
    return date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
};

export const getVehicleTypePriority = (type: string | any) => {
    switch(type) {
        case VehicleType.LKW: return 1;
        case VehicleType.AUFLIEGER: return 2; // Moved up: LKW then Auflieger
        case VehicleType.TRANSPORTER: return 3;
        case VehicleType.PKW: return 4;
        case VehicleType.ANHAENGER: return 5;
        case VehicleType.MASCHINE: return 6;
        case VehicleType.SONSTIGE: return 7;
        default: return 99;
    }
}

export const getPrioritySortValue = (p: string | Priority) => {
    if (p === Priority.HIGH || (typeof p === 'string' && p.includes('Dringend'))) return 0;
    if (p === Priority.LOW || (typeof p === 'string' && p.includes('Niedrig'))) return 2;
    return 1; // Normal
};

export const getBadgeColor = (type: string) => {
    switch(type) {
        case 'HU': return 'bg-rose-100 text-rose-800 border-rose-200';
        case 'SP': return 'bg-orange-100 text-orange-800 border-orange-200';
        case 'UVV': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'Tacho': return 'bg-purple-100 text-purple-800 border-purple-200';
        default: return 'bg-gray-100 text-gray-800';
    }
};

export const sortVehicles = (vehicles: Vehicle[]) => {
  return [...vehicles].sort((a, b) => {
    if (a.type !== b.type) {
        return getVehicleTypePriority(a.type) - getVehicleTypePriority(b.type);
    }
    return a.licensePlate.localeCompare(b.licensePlate);
  });
};

export const groupVehiclesByType = (vehicles: Vehicle[]) => {
    const activeVehicles = vehicles.filter(v => v.isActive !== false);
    const sorted = sortVehicles(activeVehicles);
    const groups: { [key: string]: Vehicle[] } = {};
    sorted.forEach(v => {
        const typeKey = String(v.type);
        if(!groups[typeKey]) groups[typeKey] = [];
        groups[typeKey].push(v);
    });
    return groups;
}

// Generates virtual log entries for overdue inspections
export const generateVirtualInspections = (vehicles: Vehicle[]): LogEntry[] => {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
    
    const virtual: LogEntry[] = [];

    const activeVehicles = vehicles.filter(v => v.isActive !== false);

    activeVehicles.forEach((v: Vehicle) => {
        const check = (type: 'HU'|'SP'|'UVV'|'Tacho', dateStr?: string) => {
            if (!dateStr) return;
            // dateStr is MM/YYYY
            const [m, y] = dateStr.split('/');
            if (!m || !y) return;
            const iso = `${y}-${m.padStart(2, '0')}`; // YYYY-MM

            let priority = Priority.NORMAL;
            // If strictly less than current month -> Overdue -> High Priority
            if (iso < currentMonthStr) priority = Priority.HIGH;
            // If equal to current month -> Normal Priority
            else if (iso === currentMonthStr) priority = Priority.NORMAL;
            else return; // Future

            virtual.push({
                id: `virt_${v.id}_${type}_${dateStr}`, // Unique ID
                vehicleId: v.id,
                type: 'Prüfung',
                description: `${type} Fällig (${dateStr})`,
                priority: priority,
                dateAdded: getTodayDate(), 
                status: 'OPEN',
                inspectionType: type,
                isVirtual: true // Flag to handle click differently
            });
        };

        check('HU', v.nextHU);
        check('SP', v.nextSP);
        check('UVV', v.nextUVV);
        check('Tacho', v.nextTacho);
    });

    return virtual;
}
