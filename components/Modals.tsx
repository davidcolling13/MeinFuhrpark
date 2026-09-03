
import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { ModalOverlay } from './Common';
import { Vehicle, VehicleType, Priority, OrderStatus } from '../types';
import { Icons } from '../icons';
import { getTodayDate, fromInputFormat, getVehicleTypePriority, groupVehiclesByType } from '../utils';
import { api } from '../api';

// --- HELPER ---
const PriorityCheckbox = ({ label, checked, onChange }: any) => (
    <label className="flex items-center gap-1 cursor-pointer select-none text-sm">
        <input 
            type="checkbox" 
            checked={checked} 
            onChange={onChange}
            className="w-4 h-4 accent-blue-600"
        />
        {label}
    </label>
);

// --- MODALS ---

export const VehicleModal = ({ isOpen, onClose, vehicle, onSave }: any) => {
    const [formData, setFormData] = useState<Partial<Vehicle>>({
        type: VehicleType.PKW,
        licensePlate: '',
        manufacturer: '',
        model: '',
        vin: '',
        year: new Date().getFullYear(),
        notes: '',
        currentMileage: 0,
        registrationDoc: '',
        isActive: true,
        keyNum21: '',
        keyNum22: '',
        maintenanceContract: false,
        maintenanceContractExpiry: '',
        maintenanceContractType: '',
        ...vehicle
    });
    const [loadingDoc, setLoadingDoc] = useState(false);

    useEffect(() => { 
        if (isOpen) {
            setFormData({ 
                type: VehicleType.PKW, 
                licensePlate: '',
                manufacturer: '',
                model: '',
                vin: '',
                year: new Date().getFullYear(),
                notes: '',
                currentMileage: 0,
                registrationDoc: '', // Reset first
                isActive: true,
                nextHU: '',
                nextSP: '',
                nextUVV: '',
                nextTacho: '',
                keyNum21: '',
                keyNum22: '',
                maintenanceContract: false,
                maintenanceContractExpiry: '',
                maintenanceContractType: '',
                ...vehicle 
            }); 
            
            // LAZY LOADING: If we have a flag 'hasDoc' but no actual doc string, fetch it.
            if (vehicle?.id && vehicle.hasDoc && !vehicle.registrationDoc) {
                setLoadingDoc(true);
                api.get(`/vehicles/${vehicle.id}/doc`)
                   .then(res => {
                       if (res && res.doc) {
                           setFormData(prev => ({ ...prev, registrationDoc: res.doc }));
                       }
                   })
                   .catch(e => console.error("Failed to lazy load doc", e))
                   .finally(() => setLoadingDoc(false));
            } else if (vehicle?.registrationDoc) {
                // If it was already loaded (e.g. freshly created), keep it
                setFormData(prev => ({ ...prev, registrationDoc: vehicle.registrationDoc }));
            }
        }
    }, [isOpen, vehicle?.id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, registrationDoc: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveFile = () => {
        if(confirm('Möchten Sie das hinterlegte Dokument wirklich entfernen?')) {
            setFormData(prev => ({ ...prev, registrationDoc: '' }));
        }
    };

    return (
        <ModalOverlay isOpen={isOpen} onClose={onClose}>
            <div className="p-6">
                <h3 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">{vehicle ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}</h3>
                <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                    
                    {/* Stammdaten */}
                    <div className="flex items-center justify-between">
                        <div className="flex-1 mr-4">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Kennzeichen</label>
                            <input 
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" 
                                placeholder="z.B. M-AB 123"
                                value={formData.licensePlate || ''} 
                                onChange={e => setFormData({...formData, licensePlate: e.target.value})} 
                            />
                        </div>
                        <div className="flex items-center mt-6">
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                <input 
                                    type="checkbox" 
                                    className="w-5 h-5 accent-blue-600 rounded"
                                    checked={formData.isActive !== false}
                                    onChange={e => setFormData({...formData, isActive: e.target.checked})}
                                />
                                Aktiv
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Fahrzeugtyp</label>
                            <select 
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                                value={formData.type} 
                                onChange={e => setFormData({...formData, type: e.target.value as VehicleType})}
                            >
                                {Object.values(VehicleType).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Baujahr</label>
                            <input 
                                type="number"
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                                value={formData.year || new Date().getFullYear()} 
                                onChange={e => setFormData({...formData, year: parseInt(e.target.value) || new Date().getFullYear()})} 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Hersteller</label>
                            <input 
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                                placeholder="z.B. MAN"
                                value={formData.manufacturer || ''} 
                                onChange={e => setFormData({...formData, manufacturer: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Modell / Typ</label>
                            <input 
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                                placeholder="z.B. TGS 18.460"
                                value={formData.model || ''} 
                                onChange={e => setFormData({...formData, model: e.target.value})} 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Schlüsselnummer 2.1</label>
                            <input 
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm uppercase" 
                                placeholder="0000"
                                maxLength={4}
                                value={formData.keyNum21 || ''} 
                                onChange={e => setFormData({...formData, keyNum21: e.target.value.toUpperCase()})} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Schlüsselnummer 2.2</label>
                            <input 
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm uppercase" 
                                placeholder="0000000000"
                                maxLength={10}
                                value={formData.keyNum22 || ''} 
                                onChange={e => setFormData({...formData, keyNum22: e.target.value.toUpperCase()})} 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Fahrgestellnummer (FIN)</label>
                        <input 
                            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" 
                            placeholder="WMA..."
                            value={formData.vin || ''} 
                            onChange={e => setFormData({...formData, vin: e.target.value})} 
                        />
                    </div>
                    
                    {/* Fahrzeugschein Upload */}
                    <div className="bg-blue-50 p-4 rounded border border-blue-200 mt-4">
                        <label className="block text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                             Fahrzeugschein (PDF)
                        </label>
                        <input 
                            type="file" 
                            accept="application/pdf"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
                        />
                        {loadingDoc && <div className="mt-2 text-xs text-blue-500 animate-pulse">Lade Dokument...</div>}
                        {formData.registrationDoc && (
                            <div className="mt-3 flex items-center justify-between bg-white p-2 rounded border border-green-200 shadow-sm">
                                <div className="text-xs text-green-700 font-bold flex items-center gap-2">
                                    <Icons.Check /> Dokument hinterlegt
                                </div>
                                <button 
                                    onClick={handleRemoveFile}
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-bold"
                                    title="Dokument löschen"
                                >
                                    <Icons.Trash /> Löschen
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Termine Box */}
                    <div className="bg-slate-50 p-4 rounded border border-slate-200 mt-4">
                        <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Icons.Calendar /> Prüftermine (Monat/Jahr)
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nächste HU</label>
                                <input 
                                    type="text"
                                    placeholder="MM/JJJJ"
                                    className="w-full border border-gray-300 p-2 rounded text-center font-mono focus:border-blue-500 outline-none" 
                                    value={formData.nextHU || ''} 
                                    onChange={e => setFormData({...formData, nextHU: e.target.value})} 
                                    onBlur={e => setFormData({...formData, nextHU: fromInputFormat(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nächste SP</label>
                                <input 
                                    type="text"
                                    placeholder="MM/JJJJ"
                                    className="w-full border border-gray-300 p-2 rounded text-center font-mono focus:border-blue-500 outline-none" 
                                    value={formData.nextSP || ''} 
                                    onChange={e => setFormData({...formData, nextSP: e.target.value})} 
                                    onBlur={e => setFormData({...formData, nextSP: fromInputFormat(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nächste UVV</label>
                                <input 
                                    type="text"
                                    placeholder="MM/JJJJ"
                                    className="w-full border border-gray-300 p-2 rounded text-center font-mono focus:border-blue-500 outline-none" 
                                    value={formData.nextUVV || ''} 
                                    onChange={e => setFormData({...formData, nextUVV: e.target.value})} 
                                    onBlur={e => setFormData({...formData, nextUVV: fromInputFormat(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nächste Tacho</label>
                                <input 
                                    type="text"
                                    placeholder="MM/JJJJ"
                                    className="w-full border border-gray-300 p-2 rounded text-center font-mono focus:border-blue-500 outline-none" 
                                    value={formData.nextTacho || ''} 
                                    onChange={e => setFormData({...formData, nextTacho: e.target.value})} 
                                    onBlur={e => setFormData({...formData, nextTacho: fromInputFormat(e.target.value)})}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Wartungsvertrag Box */}
                    <div className="bg-indigo-50 p-4 rounded border border-indigo-200 mt-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-indigo-700 text-sm uppercase tracking-wide flex items-center gap-2">
                                <Icons.Wrench /> Wartungsvertrag
                            </h4>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={!!formData.maintenanceContract}
                                    onChange={e => setFormData({...formData, maintenanceContract: e.target.checked})}
                                />
                                <span className="text-sm font-bold text-gray-700">Vorhanden</span>
                            </label>
                        </div>
                        {formData.maintenanceContract && (
                            <div className="grid grid-cols-2 gap-4 border-t border-indigo-100 pt-3 mt-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Ablaufdatum</label>
                                    <input 
                                        type="text"
                                        placeholder="MM/JJJJ"
                                        className="w-full border border-gray-300 p-2 rounded text-center font-mono focus:border-blue-500 outline-none" 
                                        value={formData.maintenanceContractExpiry || ''} 
                                        onChange={e => setFormData({...formData, maintenanceContractExpiry: e.target.value})} 
                                        onBlur={e => setFormData({...formData, maintenanceContractExpiry: fromInputFormat(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Vertragsart</label>
                                    <input 
                                        type="text"
                                        placeholder="z.B. Full-Service"
                                        className="w-full border border-gray-300 p-2 rounded focus:border-blue-500 outline-none" 
                                        value={formData.maintenanceContractType || ''} 
                                        onChange={e => setFormData({...formData, maintenanceContractType: e.target.value})} 
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Zusatzinfos */}
                     <div>
                         <label className="block text-sm font-bold text-gray-700 mb-1">Aktueller Kilometerstand</label>
                         <input 
                            type="number" 
                            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                            value={formData.currentMileage ?? ''} 
                            onChange={e => setFormData({...formData, currentMileage: parseInt(e.target.value) || 0})} 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Notizen</label>
                        <textarea 
                            className="w-full border border-gray-300 p-2 rounded h-20 focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
                            value={formData.notes || ''} 
                            onChange={e => setFormData({...formData, notes: e.target.value})} 
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium">Abbrechen</button>
                    <button onClick={() => onSave(formData as Vehicle)} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold shadow-sm">Speichern</button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export const InspectionModal = ({ isOpen, onClose, log, onSave }: any) => {
    const [nextDate, setNextDate] = useState('');

    useEffect(() => { 
        if(isOpen) setNextDate(''); 
    }, [isOpen]);

    if (!log) return null;

    return (
        <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
            <div className="p-6">
                <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                    <Icons.Check /> Prüfung abschließen
                </h3>
                <p className="mb-4 text-sm text-gray-600">
                    Sie schließen die Prüfung <strong>{log.description}</strong> ab. 
                    Bitte geben Sie den nächsten Fälligkeitstermin an.
                </p>
                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nächste Prüfung <span className="text-red-500">*</span></label>
                    <input 
                        type="text" required
                        placeholder="MM/JJJJ"
                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none text-center font-mono" 
                        value={nextDate} 
                        onChange={e => setNextDate(e.target.value)} 
                        onBlur={e => setNextDate(fromInputFormat(e.target.value))}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium">Abbrechen</button>
                    <button 
                        onClick={() => { if(nextDate) onSave(log, fromInputFormat(nextDate)); else toast.warning('Bitte wählen Sie den nächsten Termin aus.'); }} 
                        disabled={!nextDate}
                        className={`px-4 py-2 text-white rounded font-bold shadow-sm ${!nextDate ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                        Abschließen & Speichern
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export const CompletionModal = ({ isOpen, onClose, log, onConfirm }: any) => {
    const [mileage, setMileage] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => { 
        if (isOpen) {
            setMileage('');
            setNotes('');
        }
    }, [isOpen]);

    if (!isOpen || !log) return null;

    return (
        <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
            <div className="p-6">
                <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                    <Icons.Check /> Aufgabe erledigen
                </h3>
                <p className="mb-4 text-sm text-gray-600">
                    Abschluss von: <strong>{log.description}</strong><br/>
                    Bitte bestätigen Sie den aktuellen Kilometerstand und fügen Sie ggf. Hinweise hinzu.
                </p>
                <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Aktueller KM-Stand <span className="text-red-500">*</span></label>
                    <input 
                        type="number"
                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                        value={mileage} 
                        onChange={e => setMileage(e.target.value)}
                        placeholder="z.B. 120500"
                        autoFocus
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Hinweise / Anmerkungen</label>
                    <textarea 
                        className="w-full border border-gray-300 p-2 rounded h-24 focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Ggf. durchgeführte Arbeiten beschreiben..."
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium">Abbrechen</button>
                    <button 
                        onClick={() => {
                            const val = parseInt(mileage);
                            if(val > 0) onConfirm(log, val, notes);
                            else toast.warning("Bitte gültigen KM-Stand eingeben.");
                        }} 
                        disabled={!mileage}
                        className={`px-4 py-2 text-white rounded font-bold shadow-sm ${!mileage ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                        Bestätigen
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export const EntryModal = ({ isOpen, onClose, entry, vehicles, onSave }: any) => {
    const [header, setHeader] = useState({ vehicleId: '', dateAdded: getTodayDate(), mileage: '', type: '' });
    // Stable keys for items to prevent React rendering bugs when deleting items
    const [items, setItems] = useState<{_tempId: string, id?: string, description: string, priority: Priority}[]>([]);

    const groupedVehicles = useMemo(() => groupVehiclesByType(vehicles), [vehicles]);
    const vehicleTypes = useMemo(() => Object.keys(groupedVehicles).sort((a, b) => getVehicleTypePriority(a) - getVehicleTypePriority(b)), [groupedVehicles]);

    useEffect(() => { 
        if(isOpen) {
            if (entry) {
                setHeader({ 
                    vehicleId: entry.vehicleId, 
                    dateAdded: entry.dateAdded, 
                    mileage: entry.mileage ? String(entry.mileage) : '',
                    type: entry.type || 'Reparatur'
                });
                // When editing, we attach the ID to the specific item
                setItems([{ _tempId: 'edit-1', id: entry.id, description: entry.description, priority: entry.priority }]);
            } else {
                // Initialize new entry with 'Allgemein' (empty vehicleId) and thus empty type
                setHeader({ vehicleId: '', dateAdded: getTodayDate(), mileage: '', type: '' });
                // New entry has no ID
                setItems([{ _tempId: Math.random().toString(36), description: '', priority: Priority.NORMAL }]);
            }
        }
    }, [isOpen, entry?.id]); 

    const handleSave = () => {
        // Validation Logic: Type is mandatory only if a specific vehicle is selected
        if (header.vehicleId && !header.type) {
            toast.warning('Bitte wählen Sie eine Art (z.B. Reparatur oder Wartung) aus.');
            return;
        }

        const type = header.type;
        const mileageVal = parseInt(header.mileage) || 0;
        const newEntries = items.map(item => ({
            ...(item.id ? { id: item.id } : {}), 
            vehicleId: header.vehicleId,
            dateAdded: header.dateAdded,
            type: type,
            description: item.description,
            priority: item.priority,
            status: entry ? entry.status : 'OPEN',
            mileage: mileageVal > 0 ? mileageVal : undefined,
            dateCompleted: entry ? entry.dateCompleted : undefined,
            inspectionType: entry ? entry.inspectionType : undefined,
            attachments: entry ? entry.attachments : undefined
        }));
        const validEntries = newEntries.filter(e => e.description.trim() !== '');
        if(validEntries.length === 0) {
            toast.warning("Bitte geben Sie mindestens eine Beschreibung ein.");
            return;
        }
        onSave(validEntries);
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;
        setItems(newItems);
    };

    const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
    const addItem = () => setItems([...items, { _tempId: Math.random().toString(36), description: '', priority: Priority.NORMAL }]);

    return (
        <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
             <div className="p-6">
                <h3 className="text-xl font-bold mb-4">{entry ? 'Auftrag bearbeiten' : 'Neuer Auftrag'}</h3>
                <div className="flex gap-4 mb-4 items-start flex-wrap">
                    <div className="flex flex-col gap-1 w-full md:w-auto md:flex-1">
                        <label className="text-sm font-bold text-gray-700">Kennzeichen</label>
                        <div className="relative border border-gray-400 p-1 rounded bg-white">
                            <select 
                                className="w-full bg-transparent outline-none appearance-none pr-4" 
                                value={header.vehicleId} 
                                onChange={e => {
                                    const newVal = e.target.value;
                                    // Logic: If switching to 'Allgemein' (empty), clear type.
                                    // If switching to a vehicle and type is empty, default to 'Reparatur'
                                    let newType = header.type;
                                    if(newVal === '') newType = ''; 
                                    else if(newType === '') newType = 'Reparatur';

                                    setHeader({...header, vehicleId: newVal, type: newType});
                                }}
                            >
                                <option value="">Allgemein</option>
                                {vehicleTypes.map(type => (
                                    <optgroup key={type} label={type}>
                                        {groupedVehicles[type].map((v:any) => <option key={v.id} value={v.id}>{v.licensePlate}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                            <span className="absolute right-2 top-1 pointer-events-none text-gray-500 text-xs">▼</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 w-32">
                        <label className={`text-sm font-bold ${!header.vehicleId ? 'text-gray-400' : 'text-gray-700'}`}>Art {header.vehicleId && <span className="text-red-500">*</span>}</label>
                         <div className={`relative border p-1 rounded bg-white ${header.vehicleId && !header.type ? 'border-red-300 bg-red-50' : 'border-gray-400'} ${!header.vehicleId ? 'opacity-50 bg-gray-100' : ''}`}>
                            <select 
                                className="w-full bg-transparent outline-none appearance-none pr-4" 
                                value={header.type} 
                                onChange={e => setHeader({...header, type: e.target.value})}
                                disabled={!header.vehicleId}
                            >
                                <option value="" disabled>Bitte wählen...</option>
                                <option value="Reparatur">Reparatur</option>
                                <option value="Wartung">Wartung</option>
                            </select>
                            <span className="absolute right-2 top-1 pointer-events-none text-gray-500 text-xs">▼</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 w-40">
                        <label className="text-sm font-bold text-gray-700">Datum</label>
                        <div className="relative border border-gray-400 p-1 rounded bg-white">
                             <input type="date" className="w-full bg-transparent outline-none" value={header.dateAdded} onChange={e => setHeader({...header, dateAdded: e.target.value})} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 w-32">
                        <label className="text-sm font-bold text-gray-700">KM-Stand</label>
                        <div className="relative border border-gray-400 p-1 rounded bg-white">
                             <input type="number" placeholder="12345" className="w-full bg-transparent outline-none" value={header.mileage} onChange={e => setHeader({...header, mileage: e.target.value})} />
                        </div>
                    </div>
                </div>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {items.map((item, idx) => (
                        <div key={item._tempId} className="flex gap-2 items-start group">
                            <div className="border border-gray-400 p-3 flex-1 rounded bg-white shadow-sm">
                                <div className="flex gap-3 items-center text-sm mb-2 border-b border-gray-200 pb-2">
                                    <span className="font-bold text-gray-600 mr-1">Priorität:</span>
                                    <PriorityCheckbox label="normal" checked={item.priority === Priority.NORMAL} onChange={() => updateItem(idx, 'priority', Priority.NORMAL)} />
                                    <PriorityCheckbox label="dringend" checked={item.priority === Priority.HIGH} onChange={() => updateItem(idx, 'priority', Priority.HIGH)} />
                                    <PriorityCheckbox label="niedrig" checked={item.priority === Priority.LOW} onChange={() => updateItem(idx, 'priority', Priority.LOW)} />
                                </div>
                                <textarea className="w-full border border-gray-300 p-2 rounded outline-none focus:border-blue-500 text-sm min-h-[5rem] resize-y" placeholder="Beschreibung des Auftrags" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                            </div>
                            {items.length > 1 && (
                                <button onClick={() => removeItem(idx)} className="mt-4 text-gray-400 hover:text-red-600 transition-colors"><Icons.Trash /></button>
                            )}
                        </div>
                    ))}
                </div>
                <button onClick={addItem} className="w-full border-2 border-dashed border-gray-300 text-gray-500 py-2 mt-4 text-sm font-bold hover:bg-gray-50 hover:border-gray-400 hover:text-gray-700 transition-colors rounded">Neuen Auftrag hinzufügen</button>
                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium">Abbrechen</button>
                    <button onClick={() => handleSave()} className="border border-gray-400 px-6 py-2 bg-white hover:bg-gray-100 font-bold rounded shadow-sm text-gray-800">Speichern</button>
                </div>
            </div>
        </ModalOverlay>
    );
};

export const OrderModal = ({ isOpen, onClose, order, onSave, vehicles }: any) => {
    const [header, setHeader] = useState({ vehicleId: '', dateAdded: getTodayDate() });
    const [items, setItems] = useState<{_tempId: string, description: string, priority: string, supplier: string}[]>([]);

    const groupedVehicles = useMemo(() => groupVehiclesByType(vehicles), [vehicles]);
    const vehicleTypes = useMemo(() => Object.keys(groupedVehicles).sort((a, b) => getVehicleTypePriority(a) - getVehicleTypePriority(b)), [groupedVehicles]);

    useEffect(() => { 
        if(isOpen) {
             if (order) {
                setHeader({ vehicleId: order.vehicleId || '', dateAdded: order.dateAdded, });
                let desc = order.description;
                let prio = 'normal';
                if(desc.includes('[Dringend]')) { prio = 'dringend'; desc = desc.replace('[Dringend]', '').trim(); }
                if(desc.includes('[Niedrig]')) { prio = 'niedrig'; desc = desc.replace('[Niedrig]', '').trim(); }
                setItems([{ _tempId: 'edit-1', description: desc, priority: prio, supplier: order.supplier || '' }]);
            } else {
                setHeader({ vehicleId: vehicles[0]?.id || '', dateAdded: getTodayDate(), });
                setItems([{ _tempId: Math.random().toString(36), description: '', priority: 'normal', supplier: '' }]);
            }
        } 
    }, [isOpen, order?.id]);

    const handleSave = () => {
        const newOrders = items.map(item => {
            let desc = item.description;
            if(item.priority === 'dringend') desc += ' [Dringend]';
            if(item.priority === 'niedrig') desc += ' [Niedrig]';
            return {
                ...(order ? { id: order.id } : {}),
                vehicleId: header.vehicleId,
                dateAdded: header.dateAdded,
                description: desc,
                status: order ? order.status : OrderStatus.OFFEN,
                supplier: item.supplier
            };
        });
        const validOrders = newOrders.filter(o => o.description.trim() !== '');
        if(validOrders.length === 0) {
            toast.warning("Bitte füllen Sie die Beschreibung aus.");
            return;
        }
        onSave(validOrders);
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;
        setItems(newItems);
    };

    const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
    const addItem = () => setItems([...items, { _tempId: Math.random().toString(36), description: '', priority: 'normal', supplier: '' }]);

    return (
        <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
            <div className="p-6">
                <h3 className="text-xl font-bold mb-4">{order ? 'Bestellung bearbeiten' : 'Neue Bestellung'}</h3>
                <div className="flex gap-4 mb-6 items-start">
                    <div className="flex flex-col gap-1 w-1/2">
                        <label className="text-sm font-bold text-gray-700">Kennzeichen</label>
                        <div className="relative border border-gray-400 p-1 rounded bg-white">
                            <select className="w-full bg-transparent outline-none appearance-none pr-4" value={header.vehicleId} onChange={e => setHeader({...header, vehicleId: e.target.value})}>
                                <option value="">Lager/Allgemein</option>
                                {vehicleTypes.map(type => (
                                    <optgroup key={type} label={type}>
                                        {groupedVehicles[type].map((v:any) => <option key={v.id} value={v.id}>{v.licensePlate}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                            <span className="absolute right-2 top-1 pointer-events-none text-gray-500 text-xs">▼</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 w-1/2">
                        <label className="text-sm font-bold text-gray-700">Datum</label>
                        <div className="relative border border-gray-400 p-1 rounded bg-white">
                             <input type="date" className="w-full bg-transparent outline-none" value={header.dateAdded} onChange={e => setHeader({...header, dateAdded: e.target.value})} />
                        </div>
                    </div>
                </div>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                    {items.map((item, idx) => (
                        <div key={item._tempId} className="flex gap-2 items-start group">
                            <div className="border border-gray-400 p-3 flex-1 rounded bg-white shadow-sm">
                                <textarea className="w-full border border-gray-300 p-2 rounded mb-2 outline-none focus:border-blue-500 text-sm min-h-[5rem] resize-y" placeholder="Artikel / Beschreibung" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                                <div className="flex flex-col sm:flex-row gap-3 sm:items-center text-sm">
                                    <div className="flex gap-3 items-center">
                                        <span className="font-bold text-gray-600 mr-1">Priorität:</span>
                                        <PriorityCheckbox label="normal" checked={item.priority === 'normal'} onChange={() => updateItem(idx, 'priority', 'normal')} />
                                        <PriorityCheckbox label="dringend" checked={item.priority === 'dringend'} onChange={() => updateItem(idx, 'priority', 'dringend')} />
                                        <PriorityCheckbox label="niedrig" checked={item.priority === 'niedrig'} onChange={() => updateItem(idx, 'priority', 'niedrig')} />
                                    </div>
                                    <div className="flex-1">
                                        <input 
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500" 
                                            placeholder="Bestellen bei..." 
                                            value={item.supplier} 
                                            onChange={e => updateItem(idx, 'supplier', e.target.value)} 
                                        />
                                    </div>
                                </div>
                            </div>
                            {items.length > 1 && (
                                <button onClick={() => removeItem(idx)} className="mt-4 text-gray-400 hover:text-red-600 transition-colors"><Icons.Trash /></button>
                            )}
                        </div>
                    ))}
                </div>
                <button onClick={addItem} className="w-full border-2 border-dashed border-gray-300 text-gray-500 py-2 mt-4 text-sm font-bold hover:bg-gray-50 hover:border-gray-400 hover:text-gray-700 transition-colors rounded">Neue Position hinzufügen</button>
                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium">Abbrechen</button>
                    <button onClick={() => handleSave()} className="border border-gray-400 px-6 py-2 bg-white hover:bg-gray-100 font-bold rounded shadow-sm text-gray-800">Speichern</button>
                </div>
            </div>
        </ModalOverlay>
    );
};
