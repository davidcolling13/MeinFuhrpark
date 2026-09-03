
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Vehicle, VehicleType } from '../types';
import { Icons } from '../icons';
import { getVehicleTypePriority, parseDateMMYYYY } from '../utils';
import { DateCell } from '../components/Common';
import { useFleet } from '../context/FleetContext';
import { api } from '../api';

export const VehicleListView = ({ onEdit, onAdd }: any) => {
  const { vehicles, deleteVehicle } = useFleet();
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  
  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState<{ [key: string]: string }>({});

  const handleSort = (key: keyof Vehicle | 'modelFull') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const processedVehicles = useMemo(() => {
    if (!vehicles || !Array.isArray(vehicles)) return [];
    let filtered = [...vehicles];
    
    // Filter Logic
    Object.keys(filters).forEach(key => {
        const filterVal = filters[key].toLowerCase();
        if(!filterVal) return;
        filtered = filtered.filter(v => {
            let valToCheck = '';
            if (key === 'modelFull') valToCheck = `${v.manufacturer || ''} ${v.model || ''}`;
            // @ts-ignore
            else if (v[key]) valToCheck = String(v[key]);
            return valToCheck.toLowerCase().includes(filterVal);
        });
    });

    // Sort Logic
    if (sortConfig.key) {
        // User specific sort
        filtered.sort((a, b) => {
            let valA: any = sortConfig.key === 'modelFull' ? `${a.manufacturer || ''} ${a.model || ''}` : a[sortConfig.key as keyof Vehicle];
            let valB: any = sortConfig.key === 'modelFull' ? `${b.manufacturer || ''} ${b.model || ''}` : b[sortConfig.key as keyof Vehicle];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';
            if (sortConfig.key === 'year') {
                const numA = Number(valA) || 0; const numB = Number(valB) || 0;
                return sortConfig.direction === 'asc' ? (numA - numB) : (numB - numA);
            }
            if (['nextHU', 'nextSP', 'nextUVV', 'nextTacho'].includes(sortConfig.key as string)) {
                const dateA = parseDateMMYYYY(String(valA)); const dateB = parseDateMMYYYY(String(valB));
                return sortConfig.direction === 'asc' ? (dateA - dateB) : (dateB - dateA);
            }
            if (sortConfig.key === 'type') {
                const pA = getVehicleTypePriority(valA); const pB = getVehicleTypePriority(valB);
                return sortConfig.direction === 'asc' ? (pA - pB) : (pB - pA);
            }
            return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        });
    } else {
        // Default Sort
        filtered.sort((a, b) => {
            const pA = getVehicleTypePriority(a.type);
            const pB = getVehicleTypePriority(b.type);
            if (pA !== pB) return pA - pB;
            return (a.licensePlate || '').localeCompare(b.licensePlate || '');
        });
    }
    return filtered;
  }, [vehicles, sortConfig, filters]);

  const getSortIcon = (colKey: string) => {
     if (sortConfig.key !== colKey) return <span className="text-gray-300"><Icons.SortDefault /></span>;
     return sortConfig.direction === 'asc' ? <span className="text-blue-600"><Icons.SortAsc /></span> : <span className="text-blue-600"><Icons.SortDesc /></span>;
  };

  const handleOpenDoc = async (vehicleId: string) => {
      setLoadingDoc(vehicleId);
      try {
        const res = await api.get(`/vehicles/${vehicleId}/doc`);
        if (!res.doc) {
            toast.error("Dokument nicht gefunden.");
            return;
        }
        
        let url = '';
        // Check if it's a file path (starts with /uploads) or Base64 (starts with data:)
        if (res.doc.startsWith('/uploads')) {
            // It's a file path served statically
            url = res.doc; 
            window.open(url, '_blank');
        } else {
            // Legacy Base64 handling
            let base64Part = res.doc;
            let mimeType = 'application/pdf';
            if (res.doc.includes(',')) {
                const parts = res.doc.split(',');
                base64Part = parts[1];
                const mimeMatch = parts[0].match(/:(.*?);/);
                if (mimeMatch) mimeType = mimeMatch[1];
            }
            const binaryString = atob(base64Part);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
            const blob = new Blob([bytes], { type: mimeType });
            url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }
      } catch (e) {
        console.error("Doc Open Error:", e);
        toast.error("Fehler beim Öffnen des Dokuments.");
      } finally {
        setLoadingDoc(null);
      }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Fahrzeuge</h2>
        <div className="flex gap-2">
          <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2"><Icons.Plus /> Neu</button>
        </div>
      </div>
      <div className="bg-white rounded shadow overflow-x-auto border border-gray-200">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
            <tr className="border-b border-gray-200">
              <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('licensePlate')}><div className="flex items-center gap-2">Kennzeichen {getSortIcon('licensePlate')}</div></th>
              <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('type')}><div className="flex items-center gap-2">Typ {getSortIcon('type')}</div></th>
              <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('modelFull')}><div className="flex items-center gap-2">Fahrzeug {getSortIcon('modelFull')}</div></th>
               <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('year')}><div className="flex items-center gap-2">Baujahr {getSortIcon('year')}</div></th>
               <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('vin')}><div className="flex items-center gap-2">FIN {getSortIcon('vin')}</div></th>
              <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('nextHU')}><div className="flex items-center gap-2">HU {getSortIcon('nextHU')}</div></th>
               <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('nextSP')}><div className="flex items-center gap-2">SP {getSortIcon('nextSP')}</div></th>
               <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('nextUVV')}><div className="flex items-center gap-2">UVV {getSortIcon('nextUVV')}</div></th>
               <th className="p-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('nextTacho')}><div className="flex items-center gap-2">Tacho {getSortIcon('nextTacho')}</div></th>
              <th className="p-3 w-24">Aktionen</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-300">
                <th className="p-2"><input className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none" placeholder="Filter..." value={filters.licensePlate || ''} onChange={e => handleFilterChange('licensePlate', e.target.value)} /></th>
                <th className="p-2"><select className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none bg-white" value={filters.type || ''} onChange={e => handleFilterChange('type', e.target.value)}><option value="">Alle</option>{Object.values(VehicleType).map(t => <option key={t} value={t}>{t}</option>)}</select></th>
                <th className="p-2"><input className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none" placeholder="Modell..." value={filters.modelFull || ''} onChange={e => handleFilterChange('modelFull', e.target.value)} /></th>
                <th className="p-2"><input className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none" placeholder="Jahr" value={filters.year || ''} onChange={e => handleFilterChange('year', e.target.value)} /></th>
                 <th className="p-2"><input className="w-full text-xs border border-gray-300 rounded px-2 py-1 outline-none" placeholder="FIN" value={filters.vin || ''} onChange={e => handleFilterChange('vin', e.target.value)} /></th>
                <th className="p-2" colSpan={5}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {processedVehicles.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-gray-500 italic">Keine Fahrzeuge gefunden.</td></tr>}
            {processedVehicles.map((v: Vehicle) => (
              <tr key={v.id} className={`transition-colors ${v.isActive === false ? 'bg-gray-50 opacity-60' : 'hover:bg-blue-50'}`}>
                <td className="p-3 font-bold text-gray-800">
                    {v.licensePlate}
                    {v.isActive === false && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Inaktiv</span>}
                </td>
                <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">{v.type}</span></td>
                <td className="p-3 text-gray-700 text-sm">{v.manufacturer} {v.model}</td>
                <td className="p-3 text-gray-700 text-sm">{v.year}</td>
                <td className="p-3 text-gray-500 font-mono text-xs">{v.vin}</td>
                <td className="p-3 text-sm"><DateCell date={v.nextHU} /></td>
                <td className="p-3 text-sm"><DateCell date={v.nextSP} /></td>
                <td className="p-3 text-sm"><DateCell date={v.nextUVV} /></td>
                <td className="p-3 text-sm"><DateCell date={v.nextTacho} /></td>
                <td className="p-3 flex gap-2">
                  <button onClick={() => onEdit(v)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded" title="Bearbeiten"><Icons.Edit /></button>
                  {/* Show button if explicit registrationDoc is present OR hasDoc flag is set */}
                  {(v.registrationDoc || v.hasDoc) && (
                      <button 
                        onClick={() => handleOpenDoc(v.id)} 
                        disabled={loadingDoc === v.id}
                        className={`p-1.5 rounded ${loadingDoc === v.id ? 'text-blue-500 animate-pulse' : 'text-gray-500 hover:bg-gray-100'}`}
                        title="Fahrzeugschein öffnen (Neuer Tab)"
                      >
                         {loadingDoc === v.id ? <Icons.Clock /> : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13H8"/><path d="M16 13h-2.5"/></svg>
                         )}
                      </button>
                  )}
                  <button onClick={() => deleteVehicle(v.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded" title="Löschen"><Icons.Trash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const CombinationsView = () => {
    const { vehicles, coupleVehicles, uncoupleVehicles } = useFleet();
    
    const [selectedMotor, setSelectedMotor] = useState('');
    const [selectedTrailer, setSelectedTrailer] = useState('');

    const isMotor = (v: Vehicle) => [VehicleType.LKW, VehicleType.TRANSPORTER, VehicleType.PKW, VehicleType.MASCHINE].includes(v.type as VehicleType);
    const isTrailer = (v: Vehicle) => [VehicleType.ANHAENGER, VehicleType.AUFLIEGER].includes(v.type as VehicleType);

    const isCoupled = (v: Vehicle) => {
        if (v.coupledVehicleId) return true;
        return vehicles.some((other: Vehicle) => other.coupledVehicleId === v.id);
    };

    const availableMotors = vehicles.filter((v: Vehicle) => isMotor(v) && !isCoupled(v) && v.isActive !== false);
    const availableTrailers = vehicles.filter((v: Vehicle) => isTrailer(v) && !isCoupled(v) && v.isActive !== false);
    const combinations: { motor: Vehicle, trailer: Vehicle | undefined }[] = [];
    const processedPairs = new Set<string>();

    vehicles.forEach((v: Vehicle) => {
        if (v.isActive === false) return;
        
        let partnerId = v.coupledVehicleId;
        if (!partnerId) {
            const pointing = vehicles.find((other: Vehicle) => other.coupledVehicleId === v.id);
            if (pointing) partnerId = pointing.id;
        }

        if (partnerId) {
            const partner = vehicles.find((other: Vehicle) => other.id === partnerId);
            if (!partner || partner.isActive === false) return;

            // Ensure we only add each pair once
            const pairKey = [v.id, partner.id].sort().join('-');
            if (processedPairs.has(pairKey)) return;
            processedPairs.add(pairKey);

            let motor = v;
            let trailer = partner;
            
            if (isTrailer(v) && !isTrailer(partner)) {
                motor = partner;
                trailer = v;
            }

            combinations.push({ motor, trailer });
        }
    });

    const handleCouple = () => {
        if(selectedMotor && selectedTrailer) {
            coupleVehicles(selectedMotor, selectedTrailer);
            setSelectedMotor('');
            setSelectedTrailer('');
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Gespanne verwalten</h2>
            <div className="bg-white p-6 rounded shadow-sm border border-gray-200">
                <h3 className="font-bold text-lg mb-4 text-gray-700 flex items-center gap-2"><Icons.Link /> Neues Gespann bilden</h3>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-bold text-gray-600 mb-1">Motorwagen / Zugmaschine</label>
                        <select className="w-full border border-gray-300 p-2 rounded outline-none bg-white" value={selectedMotor} onChange={(e) => setSelectedMotor(e.target.value)}>
                            <option value="">Bitte wählen...</option>
                            {availableMotors.map((v: Vehicle) => <option key={v.id} value={v.id}>{v.licensePlate} ({v.model})</option>)}
                        </select>
                    </div>
                    <div className="flex items-center justify-center pb-2 text-gray-400"><Icons.Link /></div>
                    <div className="flex-1 w-full">
                         <label className="block text-sm font-bold text-gray-600 mb-1">Anhänger / Auflieger</label>
                         <select className="w-full border border-gray-300 p-2 rounded outline-none bg-white" value={selectedTrailer} onChange={(e) => setSelectedTrailer(e.target.value)}>
                            <option value="">Bitte wählen...</option>
                            {availableTrailers.map((v: Vehicle) => <option key={v.id} value={v.id}>{v.licensePlate} ({v.type})</option>)}
                        </select>
                    </div>
                    <button onClick={handleCouple} disabled={!selectedMotor || !selectedTrailer} className={`px-6 py-2 rounded font-bold text-white transition-colors ${selectedMotor && selectedTrailer ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}>Koppeln</button>
                </div>
            </div>
            <div>
                <h3 className="font-bold text-gray-600 mb-3 uppercase tracking-wide text-sm">Aktuelle Gespanne</h3>
                <div className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                    {combinations.length === 0 ? <div className="p-8 text-center text-gray-500 italic">Keine aktiven Gespanne.</div> : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase"><tr><th className="p-3">Motorwagen</th><th className="p-3">Anhänger</th><th className="p-3 text-right">Aktion</th></tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {combinations.map(({ motor, trailer }: any) => (
                                    <tr key={motor.id} className="hover:bg-gray-50">
                                        <td className="p-3"><div className="font-bold text-gray-800">{motor.licensePlate}</div><div className="text-xs text-gray-500">{motor.manufacturer} {motor.model}</div></td>
                                        <td className="p-3">{trailer ? <><div className="font-bold text-gray-800">{trailer.licensePlate}</div><div className="text-xs text-gray-500">{trailer.type}</div></> : <span className="text-red-500 text-xs italic">Fahrzeug nicht gefunden</span>}</td>
                                        <td className="p-3 text-right"><button onClick={() => uncoupleVehicles(motor.id, trailer?.id)} className="text-red-600 hover:bg-red-50 px-3 py-1 rounded text-sm font-medium border border-red-200">Trennen</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
