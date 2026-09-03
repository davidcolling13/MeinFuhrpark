
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
        }
    },
    // Mock Pagination support
    async getLogs(page?: number, limit?: number, status?: string) {
        let logs = this.load('logs');
        if (status) {
            if (status === '!DONE') logs = logs.filter((l:any) => l.status !== 'DONE');
            else logs = logs.filter((l:any) => l.status === status);
        }
        // Sort DESC
        logs.sort((a:any, b:any) => b.dateAdded.localeCompare(a.dateAdded));
        
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
    async post(collection: string, item: any) {
      const items = this.load(collection);
      const newItem = { ...item, id: generateUUID() };
      items.push(newItem);
      this.save(collection, items);
      return { success: true, id: newItem.id };
    },
    async put(collection: string, id: string, item: any) {
      const items = this.load(collection);
      const idx = items.findIndex((i:any) => i.id === id);
      if (idx !== -1) { items[idx] = item; this.save(collection, items); }
      return { success: true };
    },
    async delete(collection: string, id: string) {
      const items = this.load(collection);
      const filtered = items.filter((i:any) => i.id !== id);
      this.save(collection, filtered);
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
export const getIsOfflineMode = () => isOfflineMode;

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
      // Special Handling for Offline Logic
      if (isOfflineMode || endpoint.startsWith('/transaction') && isOfflineMode) {
          if (endpoint === '/transaction/complete-task') return mockDB.transactionCompleteTask(data);
          if (endpoint === '/transaction/complete-inspection') return mockDB.transactionCompleteInspection(data);
          
          // Handle Paging for logs
          if (endpoint.startsWith('/logs') && method === 'GET') {
              const url = new URL('http://dummy' + endpoint);
              const page = parseInt(url.searchParams.get('page') || '0');
              const limit = parseInt(url.searchParams.get('limit') || '0');
              const status = url.searchParams.get('status') || undefined;
              return mockDB.getLogs(page || undefined, limit || undefined, status);
          }
          
          const parts = endpoint.split('?')[0].split('/').filter(Boolean); // remove query params
          const collection = parts[0];
          const id = parts[1];
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
        const opts: any = { method, headers: { 'Content-Type': 'application/json' } };
        if (data) opts.body = JSON.stringify(data);
        const res = await fetch(`/api${endpoint}`, opts);
        
        if (!res.ok) {
            const ct = res.headers.get("content-type");
            // If HTML error or 404/502 -> Backend Offline
            if (!ct?.includes("application/json") || [404, 502, 503, 504].includes(res.status)) {
                 throw new Error("Backend Unavailable");
            }
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || `Server Error: ${res.status}`);
        }
        return await res.json();
      } catch (e: any) {
        if ((e.message === 'Backend Unavailable' || e.message.includes('Failed to fetch')) && !isOfflineMode) {
            console.warn('Switching to Offline Mode');
            isOfflineMode = true;
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
