
import { generateUUID } from './utils';
import { toast } from 'sonner';

// MockDB for offline fallback
const mockDB = {
    load: (key: string) => {
        try {
            return JSON.parse(localStorage.getItem(`fuhrpark_${key}`) || '[]');
        } catch (e) {
            return [];
        }
    },
    save: (key: string, data: any) => {
        try {
            localStorage.setItem(`fuhrpark_${key}`, JSON.stringify(data));
        } catch(e: any) {
            if(e.name === 'QuotaExceededError') toast.error("OFFLINE SPEICHER VOLL!");
            throw e;
        }
    },
    // Mock Pagination & Full Filter Support
    async getLogs(params: {
        page?: number;
        limit?: number;
        status?: string;
        vehicleId?: string;
        startDate?: string;
        endDate?: string;
        text?: string;
        licensePlate?: string;
        vType?: string;
        category?: string;
    } = {}) {
        const { page, limit, status, vehicleId, startDate, endDate, text, licensePlate, vType, category } = params;
        let logs = this.load('logs');
        const vehicles = this.load('vehicles');
        const vehicleMap = new Map<string, any>(vehicles.map((v: any) => [v.id, v]));

        if (status) {
            if (status === '!DONE') logs = logs.filter((l:any) => l.status !== 'DONE');
            else logs = logs.filter((l:any) => l.status === status);
        }
        if (vehicleId) {
            logs = logs.filter((l:any) => l.vehicleId === vehicleId);
        }
        if (startDate) {
            logs = logs.filter((l:any) => (l.dateCompleted || '') >= startDate);
        }
        if (endDate) {
            logs = logs.filter((l:any) => (l.dateCompleted || '') <= endDate);
        }
        if (text) {
            const q = text.toLowerCase();
            logs = logs.filter((l:any) => (l.description || '').toLowerCase().includes(q));
        }
        if (licensePlate) {
            const q = licensePlate.toLowerCase();
            logs = logs.filter((l:any) => {
                const v = vehicleMap.get(l.vehicleId);
                return v && (v.licensePlate || '').toLowerCase().includes(q);
            });
        }
        if (vType) {
            logs = logs.filter((l:any) => {
                const v = vehicleMap.get(l.vehicleId);
                return v && v.type === vType;
            });
        }
        if (category === 'inspection') {
            logs = logs.filter((l:any) => Boolean(l.inspectionType) || l.type === 'Prüfung');
        } else if (category === 'work') {
            logs = logs.filter((l:any) => !l.inspectionType && l.type !== 'Prüfung');
        }

        // Sort DESC matching server.js
        if (status === 'DONE') {
            logs.sort((a:any, b:any) => (b.dateCompleted || '').localeCompare(a.dateCompleted || ''));
        } else {
            logs.sort((a:any, b:any) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
        }
        
        const total = logs.length;
        if (page && limit) {
            const start = (page - 1) * limit;
            logs = logs.slice(start, start + limit);
        }
        
        // Mock API structure for paginated response
        if (page || limit || status) return { data: logs, total, page: page||1, limit: limit||999 };
        return logs; 
    },
    // Standard CRUD
    async get(collection: string) { return this.load(collection); },
    async getVehicleDoc(id: string) {
      const vehicles = this.load('vehicles');
      const v = vehicles.find((x: any) => x.id === id);
      return { doc: v ? (v.registrationDoc || null) : null };
    },
    async post(collection: string, item: any) {
      const items = this.load(collection);
      const newItem = { ...item, id: item.id || generateUUID(), version: 1 };
      items.push(newItem);
      this.save(collection, items);
      return { success: true, id: newItem.id };
    },
    async put(collection: string, id: string, item: any) {
      const items = this.load(collection);
      const idx = items.findIndex((i:any) => i.id === id);
      if (idx !== -1) {
          const existing = items[idx];
          const existingVersion = existing.version ?? 1;
          if (typeof item.version === 'number' && item.version !== existingVersion) {
              const err: any = new Error('Konflikt: Der Datensatz wurde zwischenzeitlich geändert. Bitte laden Sie die Daten neu.');
              err.status = 409;
              throw err;
          }
          const nextVersion = existingVersion + 1;
          // Preserve registrationDoc if null/undefined like server.js
          if (collection === 'vehicles' && (item.registrationDoc === undefined || item.registrationDoc === null)) {
              items[idx] = { ...item, id, registrationDoc: existing.registrationDoc ?? null, version: nextVersion };
          } else {
              items[idx] = { ...item, id, version: nextVersion };
          }
      } else {
          items.push({ ...item, id, version: 1 });
      }
      this.save(collection, items);
      return { success: true };
    },
    async delete(collection: string, id: string) {
      const items = this.load(collection);
      let filtered = items.filter((i:any) => i.id !== id);
      if (collection === 'vehicles') {
          filtered = filtered.map((v: any) => v.coupledVehicleId === id ? { ...v, coupledVehicleId: null } : v);
          const logs = this.load('logs').filter((l: any) => l.vehicleId !== id);
          const orders = this.load('orders').filter((o: any) => o.vehicleId !== id);
          this.save('logs', logs);
          this.save('orders', orders);
      }
      this.save(collection, filtered);
      return { success: true };
    },
    async transactionCouple(data: any) {
        const { motorId, trailerId } = data || {};
        if (!motorId || !trailerId || motorId === trailerId) {
            throw new Error('Ungültige Fahrzeugauswahl zum Koppeln.');
        }
        const vehicles = this.load('vehicles');
        const motor = vehicles.find((v: any) => v.id === motorId);
        const trailer = vehicles.find((v: any) => v.id === trailerId);
        if (!motor || !trailer) throw new Error('Mindestens ein Fahrzeug wurde nicht gefunden.');
        if (motor.isActive === false || trailer.isActive === false) throw new Error('Inaktive Fahrzeuge können nicht gekoppelt werden.');

        const updated = vehicles.map((v: any) => {
            if (v.id === motorId) return { ...v, coupledVehicleId: trailerId };
            if (v.id === trailerId) return { ...v, coupledVehicleId: motorId };
            if (v.coupledVehicleId === motorId || v.coupledVehicleId === trailerId || v.id === motor.coupledVehicleId || v.id === trailer.coupledVehicleId) {
                return { ...v, coupledVehicleId: null };
            }
            return v;
        });
        this.save('vehicles', updated);
        return { success: true };
    },
    async transactionUncouple(data: any) {
        const { motorId, trailerId } = data || {};
        const vehicles = this.load('vehicles');
        const updated = vehicles.map((v: any) => {
            if (
                (motorId && (v.id === motorId || v.coupledVehicleId === motorId)) ||
                (trailerId && (v.id === trailerId || v.coupledVehicleId === trailerId))
            ) {
                return { ...v, coupledVehicleId: null };
            }
            return v;
        });
        this.save('vehicles', updated);
        return { success: true };
    },
    async transactionCompleteTask(data: any) {
        const { logId, vehicleId, mileage, logData } = data;
        const logs = this.load('logs');
        const existingIdx = logs.findIndex((l:any) => l.id === logId);
        if (existingIdx !== -1) logs[existingIdx] = logData; else logs.push(logData);
        this.save('logs', logs);
        const vehicles = this.load('vehicles');
        const vIdx = vehicles.findIndex((v:any) => v.id === vehicleId);
        if (vIdx !== -1 && mileage > (vehicles[vIdx].currentMileage || 0)) {
            vehicles[vIdx].currentMileage = mileage;
            this.save('vehicles', vehicles);
        }
        return { success: true };
    },
    async transactionCompleteInspection(data: any) {
        const { logData, nextDate } = data;
        const logs = this.load('logs');
        const newItem = { ...logData, id: generateUUID(), status: 'DONE', priority: 'Normal', type: 'Wartung' };
        logs.push(newItem);
        this.save('logs', logs);
        const vehicles = this.load('vehicles');
        const vIdx = vehicles.findIndex((v:any) => v.id === logData.vehicleId);
        if (vIdx !== -1 && logData.inspectionType) {
             let formattedDate = nextDate;
             if (nextDate.includes('-')) {
                 const parts = nextDate.split('-');
                 formattedDate = parts[0].length === 4 ? `${parts[1]}/${parts[0]}` : `${parts[0]}/${parts[1]}`;
             } else if (nextDate.includes('.')) {
                 const parts = nextDate.split('.');
                 formattedDate = `${parts[0]}/${parts[1]}`;
             }
             vehicles[vIdx][`next${logData.inspectionType}`] = formattedDate;
             this.save('vehicles', vehicles);
        }
        return { success: true };
    }
};
  
let isOfflineMode = false;
let offlineSince = 0;
const OFFLINE_RETRY_COOLDOWN_MS = 15000;
export const getIsOfflineMode = () => isOfflineMode;

let adminToken: string | null = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('fuhrpark_admin_token') : null;
export const getAdminToken = () => adminToken;
export const setAdminToken = (token: string | null) => {
    adminToken = token;
    if (typeof sessionStorage !== 'undefined') {
        if (token) sessionStorage.setItem('fuhrpark_admin_token', token);
        else sessionStorage.removeItem('fuhrpark_admin_token');
    }
};

// Global error reporting
const reportClientError = async (error: any, context: string) => {
    try {
        if (isOfflineMode) return;
        await fetch('/api/admin/client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: error?.message || String(error),
                stack: error?.stack,
                context,
                url: window.location.href,
                userAgent: navigator.userAgent
            })
        });
    } catch (e) {
        // Ignore errors during error reporting
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
        reportClientError(event.error, 'Uncaught Error');
    });
    window.addEventListener('unhandledrejection', (event) => {
        reportClientError(event.reason, 'Unhandled Promise Rejection');
    });
}

export const api = {
    request: async (method: string, endpoint: string, data: any = null) => {
      // Periodically allow online recovery if offline mode was entered due to a transient outage
      if (isOfflineMode && Date.now() - offlineSince > OFFLINE_RETRY_COOLDOWN_MS) {
          isOfflineMode = false;
      }

      // Special Handling for Offline Logic
      if (isOfflineMode) {
          if (endpoint === '/transaction/complete-task') return mockDB.transactionCompleteTask(data);
          if (endpoint === '/transaction/complete-inspection') return mockDB.transactionCompleteInspection(data);
          if (endpoint === '/transaction/couple') return mockDB.transactionCouple(data);
          if (endpoint === '/transaction/uncouple') return mockDB.transactionUncouple(data);

          if (endpoint === '/admin/login' && method === 'POST') {
              throw new Error('Admin-Login im Offline-Modus nicht verfügbar.');
          }
          if (endpoint.startsWith('/admin/')) {
              if (endpoint === '/admin/logs' && method === 'GET') return { logs: '[Offline-Modus aktiv]' };
              return { success: true };
          }
          
          // Handle Paging & Filters for logs
          if (endpoint.startsWith('/logs') && method === 'GET') {
              const url = new URL('http://dummy' + endpoint);
              const page = parseInt(url.searchParams.get('page') || '0');
              const limit = parseInt(url.searchParams.get('limit') || '0');
              return mockDB.getLogs({
                  page: page || undefined,
                  limit: limit || undefined,
                  status: url.searchParams.get('status') || undefined,
                  vehicleId: url.searchParams.get('vehicleId') || undefined,
                  startDate: url.searchParams.get('startDate') || undefined,
                  endDate: url.searchParams.get('endDate') || undefined,
                  text: url.searchParams.get('text') || undefined,
                  licensePlate: url.searchParams.get('licensePlate') || undefined,
                  vType: url.searchParams.get('vType') || undefined,
                  category: url.searchParams.get('category') || undefined,
              });
          }
          
          const parts = endpoint.split('?')[0].split('/').filter(Boolean); // remove query params
          const collection = parts[0];
          const id = parts[1];
          const subResource = parts[2];

          if (collection === 'vehicles' && id && subResource === 'doc' && method === 'GET') {
              return mockDB.getVehicleDoc(id);
          }

          // @ts-ignore
          if (method === 'GET') return mockDB.get(collection);
          // @ts-ignore
          if (method === 'POST') return mockDB.post(collection, data);
          // @ts-ignore
          if (method === 'PUT') return mockDB.put(collection, id, data);
          // @ts-ignore
          if (method === 'DELETE') return mockDB.delete(collection, id);
      }
  
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (adminToken && endpoint.startsWith('/admin/')) {
            headers['Authorization'] = `Bearer ${adminToken}`;
        }
        const opts: any = { method, headers };
        if (data) opts.body = JSON.stringify(data);
        const res = await fetch(`/api${endpoint}`, opts);
        const ct = res.headers.get("content-type");
        
        if (!res.ok) {
            // Only treat gateway errors or non-JSON responses (except JSON 404s) as Backend Unavailable
            if (!ct?.includes("application/json") || [502, 503, 504].includes(res.status)) {
                 throw new Error("Backend Unavailable");
            }
            if (res.status === 401 && endpoint.startsWith('/admin/') && endpoint !== '/admin/login') {
                setAdminToken(null);
            }
            const errJson = await res.json().catch(() => ({}));
            const err: any = new Error(errJson.error || `Server Error: ${res.status}`);
            err.status = res.status;
            throw err;
        }
        if (!ct?.includes("application/json")) {
            throw new Error("Backend Unavailable");
        }
        isOfflineMode = false;
        return await res.json();
      } catch (e: any) {
        if ((e.message === 'Backend Unavailable' || e.message?.includes('Failed to fetch')) && !isOfflineMode) {
            console.warn('Switching to Offline Mode');
            isOfflineMode = true;
            offlineSince = Date.now();
            return api.request(method, endpoint, data); // Retry offline
        }
        reportClientError(e, `API Error: ${method} ${endpoint}`);
        throw e;
      }
    },
    get: (url: string) => api.request('GET', url),
    post: (url: string, data: any) => api.request('POST', url, data),
    put: (url: string, data: any) => api.request('PUT', url, data),
    delete: (url: string) => api.request('DELETE', url)
};
