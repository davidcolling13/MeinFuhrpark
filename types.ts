
export enum VehicleType {
  PKW = 'PKW',
  LKW = 'LKW',
  TRANSPORTER = 'Transporter',
  ANHAENGER = 'Anhänger',
  AUFLIEGER = 'Auflieger',
  SONSTIGE = 'Sonstige',
  MASCHINE = 'Maschine'
}

export enum Priority {
  LOW = 'Niedrig',
  NORMAL = 'Normal',
  HIGH = 'Dringend',
}

export enum OrderStatus {
  OFFEN = 'Offen',
  ANGEFRAGT = 'Angefragt',
  BESTELLT = 'Bestellt',
  ERLEDIGT = 'Erledigt',
}

export interface Attachment {
  name: string;
  data?: string | null; // Base64 or Path. Null if stripped for performance.
  type: string;
  hasData?: boolean; // Flag to indicate if data exists on server
}

export interface Vehicle {
  id: string;
  licensePlate: string;
  type: VehicleType | string;
  manufacturer: string;
  model: string; // Typ
  keyNum21?: string; // HSN 2.1
  keyNum22?: string; // TSN 2.2
  vin: string;
  year: number;
  notes: string;
  coupledVehicleId?: string | null; // For LKW <-> Auflieger
  
  // Inspection Due Dates (MM/YYYY)
  nextHU?: string;
  nextSP?: string;
  nextUVV?: string;
  nextTacho?: string;
  
  // Maintenance Contract
  maintenanceContract?: boolean;
  maintenanceContractExpiry?: string;
  maintenanceContractType?: string;
  
  currentMileage?: number; // KM or Hours
  registrationDoc?: string | null; // Base64 PDF Data or Path. Null in List View.
  hasDoc?: boolean | number; // Flag from optimized API to indicate doc exists
  isActive?: boolean; // Aktiv-Status
}

export interface LogEntry {
  id: string;
  vehicleId: string;
  type: string; // Generic 'Aufgabe'
  description: string;
  priority: Priority;
  dateAdded: string; // ISO Date
  dateCompleted?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'EXTERNAL' | 'DONE';
  mileage?: number;
  
  // Specific for inspections
  inspectionType?: 'HU' | 'SP' | 'UVV' | 'Tacho';
  
  // Attachments
  attachments?: Attachment[];

  // Frontend specific
  isVirtual?: boolean; // If true, this is a generated inspection task, not saved in DB yet
  notes?: string;
}

export interface Order {
  id: string;
  description: string;
  vehicleId?: string;
  dateAdded: string;
  status: OrderStatus;
  supplier?: string;
}
