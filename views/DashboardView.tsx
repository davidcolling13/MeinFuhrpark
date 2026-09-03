
import { useState } from 'react';
import { Vehicle, LogEntry, VehicleType, Priority } from '../types';
import { Icons } from '../icons';
import { useFleet } from '../context/FleetContext';
import { getIsOfflineMode } from '../api';
import { useDashboardLogic } from '../hooks/useFleetSelectors';

export const DashboardView = ({ onStatusUpdate, onEdit, onAdd, onInspect }: any) => {
  const { logs, deleteLog } = useFleet(); // logs needed for offline check length
  
  const [showCoupled, setShowCoupled] = useState(false); 
  const [sortMode, setSortMode] = useState<'priority' | 'type' | 'license'>('priority');
  const [filters, setFilters] = useState({ licensePlate: '', type: '', priority: '', category: '' });

  // Use Custom Hook for Logic
  const { sortedGroupKeys, groupedLogs, safeVehicles } = useDashboardLogic(showCoupled, sortMode, filters);

  const isOffline = getIsOfflineMode();

  const displayGroups: any[] = [];
  const processedVids = new Set<string>();

  sortedGroupKeys.forEach((vid) => {
      if (processedVids.has(vid)) return;
      
      const vehicle = safeVehicles.find((v: Vehicle) => v.id === vid);
      let coupledVid = vehicle?.coupledVehicleId;
      if (!coupledVid) {
          const pointingVehicle = safeVehicles.find((v: Vehicle) => v.coupledVehicleId === vid);
          if (pointingVehicle) {
              coupledVid = pointingVehicle.id;
          }
      }
      
      if (coupledVid) {
          const v1 = vehicle;
          const v2 = safeVehicles.find((v: Vehicle) => v.id === coupledVid);
          
          let motorVid = vid;
          let trailerVid = coupledVid;

          const isTrailer = (type?: string) => type === VehicleType.ANHAENGER || type === VehicleType.AUFLIEGER;
          if (isTrailer(v1?.type) && !isTrailer(v2?.type)) {
              motorVid = coupledVid;
              trailerVid = vid;
          }

          displayGroups.push({ type: 'coupled', vid1: motorVid, vid2: trailerVid });
          processedVids.add(vid);
          processedVids.add(coupledVid);
      } else {
          displayGroups.push({ type: 'single', vid });
          processedVids.add(vid);
      }
  });

  const renderVehicleCard = (vid: string, isCoupledChild: boolean = false) => {
    const vehicleLogs = groupedLogs[vid] || [];
    const vehicle = safeVehicles.find((v:Vehicle) => v.id === vid);
    
    let coupledVehicle = vehicle?.coupledVehicleId ? safeVehicles.find((v:Vehicle) => v.id === vehicle.coupledVehicleId) : null;
    if (!coupledVehicle) {
        const pointingVehicle = safeVehicles.find((v: Vehicle) => v.coupledVehicleId === vid);
        if (pointingVehicle) {
            coupledVehicle = pointingVehicle;
        }
    }
    
    const hasUrgent = vehicleLogs.some((l: LogEntry) => l.priority === Priority.HIGH);

    return (
      <div key={vid} className={`bg-white rounded shadow-sm border ${isCoupledChild ? 'border-indigo-200' : 'border-gray-200'} overflow-hidden flex flex-col w-full`}>
        <div className={`${isCoupledChild ? 'bg-indigo-50/80' : 'bg-slate-50'} border-b ${isCoupledChild ? 'border-indigo-100' : 'border-gray-200'} px-3 py-2 flex justify-between items-center`}>
            <div className="flex-1">
                <div className="font-bold text-sm text-slate-800 flex items-center flex-wrap gap-1">
                    <span>{vehicle ? vehicle.licensePlate : 'Allgemein / Lager'}</span>
                    {vehicle && (vehicle.manufacturer || vehicle.model) && (
                        <span className="font-normal text-slate-600">
                            - {vehicle.manufacturer} {vehicle.model}
                        </span>
                    )}
                    {vehicle && vehicle.type && (
                        <span className="font-normal text-slate-500">
                            - {vehicle.type}
                        </span>
                    )}
                    {!isCoupledChild && coupledVehicle && (
                        <span className="text-xs text-gray-400 font-normal flex items-center gap-1 ml-2" title={`Gekoppelt mit: ${coupledVehicle.licensePlate}`}>
                            <span className="opacity-50 scale-75"><Icons.Link /></span> {coupledVehicle.licensePlate}
                        </span>
                    )}
                </div>
            </div>
            <div className={`${hasUrgent ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-200 text-slate-600'} px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ml-2`}>{vehicleLogs.length}</div>
        </div>
        <div className="divide-y divide-gray-100 flex-1">
            {vehicleLogs.length === 0 ? (
                <div className="p-3 text-xs text-gray-400 italic text-center">Keine offenen Aufgaben</div>
            ) : (
                vehicleLogs.map((log: LogEntry) => {
                const isDone = log.status === 'DONE';
                const isInProgress = log.status === 'IN_PROGRESS';
                const isExternal = log.status === 'EXTERNAL';
                return (
                    <div key={log.id} className={`p-2 group transition-colors ${isInProgress ? 'bg-amber-50' : isExternal ? 'bg-indigo-50' : isDone ? 'bg-gray-50 opacity-75' : 'hover:bg-blue-50'}`}>
                        <div className="flex justify-between items-start gap-1.5">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wider border ${log.priority === Priority.HIGH ? 'bg-red-100 text-red-800 border-red-200' : log.priority === Priority.LOW ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-blue-50 text-blue-800 border-blue-100'}`}>{log.priority}</span>
                                        
                                        {!log.isVirtual && (
                                            <span className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wider border ${
                                                log.type === 'Reparatur' || log.type === 'Aufgabe' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                                log.type === 'Wartung' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                                'bg-gray-100 text-gray-600 border-gray-200'
                                            }`}>
                                                {log.type === 'Aufgabe' ? 'Reparatur' : log.type}
                                            </span>
                                        )}

                                        {isInProgress && <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200"><Icons.Clock /> In Bearbeitung</span>}
                                        {isExternal && <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200"><Icons.Wrench /> Werkstatt</span>}
                                        {log.isVirtual && <span className="text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200">PRÜFUNG</span>}
                                </div>
                                <div className={`text-sm text-gray-800 whitespace-pre-wrap ${isDone ? 'line-through text-gray-500' : ''}`}>{log.description}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5 flex gap-2"><span>Erstellt: {log.dateAdded}</span>{log.mileage && <span>• KM: {log.mileage}</span>}</div>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                {!isDone && (
                                    <div className="flex gap-1">
                                        {(isInProgress || isExternal) && !log.isVirtual && (
                                            <button onClick={() => onStatusUpdate(log, 'OPEN')} className="p-1 bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 hover:border-gray-300 rounded shadow-sm transition-all" title="Zurücksetzen"><Icons.Undo /></button>
                                        )}
                                        {!isInProgress && !isExternal && !log.isVirtual && (
                                            <>
                                                <button onClick={() => onStatusUpdate(log, 'IN_PROGRESS')} className="p-1 bg-white border border-gray-200 text-amber-500 hover:bg-amber-50 hover:border-amber-300 rounded shadow-sm transition-all" title="In Bearbeitung setzen"><Icons.Clock /></button>
                                                <button onClick={() => onStatusUpdate(log, 'EXTERNAL')} className="p-1 bg-white border border-gray-200 text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 rounded shadow-sm transition-all" title="An externe Werkstatt vergeben"><Icons.Wrench /></button>
                                            </>
                                        )}
                                        <button onClick={() => log.isVirtual ? onInspect(log) : onStatusUpdate(log, 'DONE')} className="p-1 bg-white border border-gray-200 text-green-600 hover:bg-green-50 hover:border-green-300 rounded shadow-sm transition-all" title={log.isVirtual ? "Prüfung durchführen" : "Erledigen"}><Icons.Check /></button>
                                    </div>
                                )}
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!log.isVirtual && (
                                        <>
                                        <button onClick={() => onEdit(log)} className="p-1 text-blue-400 hover:text-blue-600"><Icons.Edit /></button>
                                        <button onClick={() => deleteLog(log.id)} className="p-1 text-red-300 hover:text-red-600"><Icons.Trash /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isOffline && logs.length === 0 && (
          <div className="bg-amber-100 border border-amber-300 text-amber-800 p-4 rounded shadow-sm flex items-center gap-3 animate-pulse-once">
              <Icons.WifiOff />
              <div>
                  <div className="font-bold">Keine Verbindung zum Server</div>
                  <div className="text-sm">Die App läuft im Offline-Modus. Da keine lokalen Daten gespeichert sind, ist die Liste leer. Bitte stellen Sie eine Verbindung zum Backend her.</div>
              </div>
          </div>
      )}

      <div className="bg-white p-3 rounded shadow-sm border border-gray-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-xl font-bold text-gray-800 whitespace-nowrap">ToDo Liste</h2>
              <div className="h-6 w-px bg-gray-300 hidden md:block"></div>
              <div className="flex items-center gap-2">
                 <div className="relative group">
                      <span className="absolute left-2.5 top-2 text-gray-400 pointer-events-none"><Icons.SortAsc /></span>
                       <select className="w-36 py-1.5 pl-8 pr-6 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none bg-white text-gray-700 appearance-none cursor-pointer font-bold" value={sortMode} onChange={e => setSortMode(e.target.value as any)}>
                          <option value="priority">Priorität</option>
                          <option value="type">Fahrzeugtyp</option>
                          <option value="license">Kennzeichen</option>
                      </select>
                 </div>
              </div>
              <div className="h-6 w-px bg-gray-300 hidden md:block"></div>
              <div className="flex flex-wrap items-center gap-2">
                  <div className="relative group">
                      <span className="absolute left-2.5 top-2 text-gray-400 group-focus-within:text-blue-500 pointer-events-none"><Icons.Search /></span>
                      <input type="text" placeholder="Suchen..." className="w-32 md:w-48 pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none" value={filters.licensePlate} onChange={e => setFilters({...filters, licensePlate: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-2">
                      <div className="relative">
                           <select className="w-28 py-1.5 pl-2 pr-6 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none bg-white text-gray-600 appearance-none cursor-pointer" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
                              <option value="">Alle Arten</option>
                              {Object.values(VehicleType).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                      </div>
                      <div className="flex items-center gap-1.5 border border-gray-300 rounded px-2 py-1.5 bg-white h-[34px]" title="Zeigt auch gekoppelte Fahrzeuge an, die nicht dem gewählten Filter entsprechen">
                           <input 
                              type="checkbox" 
                              id="showCoupled" 
                              className="accent-blue-600 w-3.5 h-3.5 cursor-pointer"
                              checked={showCoupled}
                              onChange={e => setShowCoupled(e.target.checked)}
                           />
                           <label htmlFor="showCoupled" className="text-xs text-gray-600 cursor-pointer select-none font-medium whitespace-nowrap hidden sm:inline">Gespanne anzeigen</label>
                           <label htmlFor="showCoupled" className="text-xs text-gray-600 cursor-pointer select-none font-medium whitespace-nowrap sm:hidden"><Icons.Link /></label>
                      </div>
                  </div>
                   <div className="relative">
                       <select className="w-28 py-1.5 pl-2 pr-6 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none bg-white text-gray-600 appearance-none cursor-pointer" value={filters.priority} onChange={e => setFilters({...filters, priority: e.target.value})}>
                          <option value="">Alle Prio</option>
                          {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                  </div>
                   <div className="relative">
                       <select className="w-36 py-1.5 pl-2 pr-6 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none bg-white text-gray-600 appearance-none cursor-pointer" value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})}>
                          <option value="">Alle Einträge</option>
                          <option value="inspection">Nur Prüfungen</option>
                          <option value="work">Wartung & Reparatur</option>
                      </select>
                  </div>
                  {(filters.licensePlate || filters.type || filters.priority || filters.category) && (
                      <button onClick={() => setFilters({licensePlate: '', type: '', priority: '', category: ''})} className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50" title="Filter löschen"><Icons.Trash /></button>
                  )}
              </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end xl:self-auto">
               <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center gap-2 shadow-sm font-bold text-sm"><Icons.Plus /> Neu</button>
          </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sortedGroupKeys.length === 0 && !isOffline && <div className="col-span-full text-center py-12 text-gray-400 bg-gray-50 rounded border border-dashed border-gray-300">Keine Aufgaben gefunden.</div>}
        
        {displayGroups.map((group, idx) => {
            if (group.type === 'single') {
                return (
                    <div key={group.vid} className="flex flex-col">
                        {renderVehicleCard(group.vid)}
                    </div>
                );
            } else {
                return (
                    <div key={`coupled-${idx}`} className="flex flex-col gap-3 p-3 rounded-xl border-2 border-indigo-400 bg-indigo-50/30 shadow-sm relative mt-2">
                        <div className="absolute -top-3 left-3 bg-indigo-100 text-indigo-800 border border-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                            <span className="scale-75"><Icons.Link /></span> Gespann
                        </div>
                        {renderVehicleCard(group.vid1, true)}
                        {renderVehicleCard(group.vid2, true)}
                    </div>
                );
            }
        })}
      </div>
    </div>
  );
};
