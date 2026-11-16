
import { Vehicle, Priority, VehicleType, LogEntry } from './types';

export const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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

// Safely parse "MM/YYYY" into validated numeric month (1-12) and 4-digit year
export const parseMMYYYYParts = (dateStr?: string): { month: number; year: number } | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.trim().split('/');
    if (parts.length !== 2) return null;
    const month = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);
    if (isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 1900 || year > 2100 || !/^\d{4}$/.test(parts[1].trim())) {
        return null;
    }
    return { month, year };
};

export const isValidMMYYYY = (dateStr?: string): boolean => parseMMYYYYParts(dateStr) !== null;

// Convert "YYYY-MM" (Input type="month") or common variants to "MM/YYYY" (Storage)
export const fromInputFormat = (dateStr: string) => {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    if (!trimmed) return '';
    let y = '', m = '';
    if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length !== 2) return trimmed;
        if (parts[0].length === 4) {
            y = parts[0];
            m = parts[1];
        } else {
            m = parts[0];
            y = parts[1];
        }
    } else if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length !== 2) return trimmed;
        m = parts[0];
        y = parts[1];
    } else if (trimmed.includes('.')) {
        const parts = trimmed.split('.');
        if (parts.length !== 2) return trimmed;
        m = parts[0];
        y = parts[1];
    } else if (trimmed.length === 4 && !isNaN(Number(trimmed))) {
        m = trimmed.substring(0, 2);
        y = trimmed.substring(2, 4);
    } else if (trimmed.length === 6 && !isNaN(Number(trimmed))) {
        m = trimmed.substring(0, 2);
        y = trimmed.substring(2, 6);
    } else {
        return trimmed;
    }
    if (y && y.length === 2 && /^\d{2}$/.test(y)) y = '20' + y;
    const monthNum = parseInt(m, 10);
    const yearNum = parseInt(y, 10);
    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
        return trimmed;
    }
    return `${String(monthNum).padStart(2, '0')}/${String(yearNum)}`;
};

export const parseDateMMYYYY = (dateStr?: string) => {
    const parsed = parseMMYYYYParts(dateStr);
    if (!parsed) return 0;
    const date = new Date(parsed.year, parsed.month - 1);
    if (isNaN(date.getTime())) return 0;
    return date.getTime();
};

export const formatDateFullMonth = (dateStr?: string) => {
    const parsed = parseMMYYYYParts(dateStr);
    if (!parsed) return dateStr || '';
    const date = new Date(parsed.year, parsed.month - 1);
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

const sortVehicles = (vehicles: Vehicle[]) => {
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
            const parsed = parseMMYYYYParts(dateStr);
            if (!parsed) return;
            const iso = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`; // YYYY-MM

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
