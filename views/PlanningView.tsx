
import { useState, useMemo } from 'react';
import { Vehicle, Order, OrderStatus } from '../types';
import { Icons } from '../icons';
import { getTodayDate, getBadgeColor, getPrioritySortValue, formatDateFullMonth } from '../utils';
import { useFleet } from '../context/FleetContext';
import { useVehicleAppointments } from '../hooks/useFleetSelectors';

// --- SUB-COMPONENTS ---
const AppointmentCard = ({ apt, isOverdue, onComplete }: any) => (
  <div className={`bg-white rounded shadow-sm border-l-4 overflow-hidden relative print:break-inside-avoid print:border-gray-300 print:shadow-none ${isOverdue ? 'border-red-600 bg-red-50' : 'border-blue-400'}`}>
     <div className="p-2">
         <div className="flex justify-between items-center mb-1">
             <span className={`inline-block px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-wide ${isOverdue ? 'bg-red-600 text-white' : 'bg-blue-100 text-blue-800'}`}>{isOverdue ? 'ÜBERFÄLLIG' : 'Diesen Monat'}</span>
             <span className={`font-mono font-bold text-xs ${isOverdue ? 'text-red-700' : 'text-blue-600'}`}>{apt.date}</span>
         </div>
         <div className="mb-2"><div className="text-base font-bold text-gray-800 leading-tight truncate" title={apt.license}>{apt.license}</div><div className="text-[10px] text-gray-500 truncate">{apt.vehicleType}</div></div>
         <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100/50">
             <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getBadgeColor(apt.inspectionType)}`}>{apt.inspectionType}</span>
             <button onClick={() => onComplete(apt)} className={`print:hidden flex items-center gap-1 text-white px-2 py-1 rounded shadow-sm transition-colors text-[10px] font-bold ${isOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-800'}`} title="Prüfung erledigen"><Icons.Check /><span className="hidden sm:inline">Erledigen</span></button>
         </div>
     </div>
 </div>
);

const StatusButton = ({ currentStatus, targetStatus, icon, colorClass, onClick, label }: any) => (
    <button type="button" onClick={onClick} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border transition-all ${currentStatus === targetStatus ? colorClass : 'bg-white text-gray-700 shadow-sm border-gray-300'}`} title={label}>
        {icon}<span className={currentStatus === targetStatus ? 'inline' : 'hidden xl:inline'}>{label}</span>
    </button>
);

export const AppointmentsView = ({ onComplete }: any) => {
  const [selectedMonth, setSelectedMonth] = useState(getTodayDate().substring(0, 7));
  
  // Use Custom Hook for Logic
  const { overdue, dueThisMonth, upcomingGrouped } = useVehicleAppointments(selectedMonth);

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="hidden print:block mb-4 border-b-2 border-slate-800 pb-2">
          <h1 className="text-2xl font-bold text-slate-800">FuhrparkManager - Prüfungs-Monitor</h1>
          <div className="text-sm text-slate-600">Monatsübersicht für: {selectedMonth}</div>
      </div>
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b pb-2 gap-2 print:hidden">
          <div><h2 className="text-xl font-bold text-gray-800">Prüfungs-Monitor</h2><div className="text-xs text-gray-500 mt-0.5">Anzeige für: <span className="font-mono font-bold text-gray-700">{selectedMonth}</span></div></div>
          <div className="flex items-center gap-2 bg-white p-1 rounded border shadow-sm print:hidden">
             <button onClick={() => window.print()} className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold transition-colors border border-slate-300 mr-2" title="Monatsübersicht drucken"><Icons.FileText /><span className="hidden sm:inline">Drucken</span></button>
             <span className="text-xs font-bold text-gray-600">Monat:</span>
             <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border border-gray-300 rounded px-1 py-0.5 text-xs font-sans focus:outline-none" />
             {selectedMonth !== getTodayDate().substring(0, 7) && <button onClick={() => setSelectedMonth(getTodayDate().substring(0, 7))} className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">Heute</button>}
          </div>
      </div>
      {overdue.length > 0 && (
          <div className="space-y-2 animate-pulse-once">
              <h3 className="font-bold text-red-700 text-sm flex items-center gap-2 bg-red-50 p-2 rounded border border-red-200"><Icons.Alert /> ÜBERFÄLLIG ({overdue.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 gap-3">{overdue.map(apt => <AppointmentCard key={apt.id} apt={apt} isOverdue={true} onComplete={onComplete} />)}</div>
          </div>
      )}
      <div className="space-y-2">
          <h3 className="font-bold text-blue-800 text-sm flex items-center gap-2 border-b border-blue-200 pb-1"><Icons.Calendar /> FÄLLIG IM {selectedMonth} ({dueThisMonth.length})</h3>
          {dueThisMonth.length === 0 && <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded text-center">📅 Nichts geplant</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 gap-3">{dueThisMonth.map(apt => <AppointmentCard key={apt.id} apt={apt} isOverdue={false} onComplete={onComplete} />)}</div>
      </div>
      <div className="pt-6 border-t mt-4 print:hidden">
          <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">Vorschau (Quartalsansicht)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.keys(upcomingGrouped).length === 0 && <div className="col-span-full text-xs text-gray-400 italic">Keine späteren Termine.</div>}
              {Object.keys(upcomingGrouped).map(dateKey => (
                  <div key={dateKey} className="bg-white border border-gray-200 rounded shadow-sm flex flex-col h-full">
                      <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 flex justify-between items-center"><span className="font-bold text-gray-700 text-sm">{formatDateFullMonth(dateKey)}</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 rounded text-gray-500 font-bold shadow-sm">{upcomingGrouped[dateKey].length}</span></div>
                      <div className="divide-y divide-gray-100 p-1">
                          {upcomingGrouped[dateKey].map(apt => (
                              <div key={apt.id} className="p-2 flex justify-between items-center hover:bg-gray-50 transition-colors rounded">
                                  <div className="flex items-center gap-2 overflow-hidden"><div className={`shrink-0 w-9 text-center text-[9px] font-bold px-0.5 py-0.5 rounded border ${getBadgeColor(apt.inspectionType)}`}>{apt.inspectionType}</div><div className="min-w-0"><div className="font-bold text-gray-800 text-xs truncate">{apt.license}</div><div className="text-[9px] text-gray-500 truncate">{apt.vehicleType}</div></div></div>
                                  <button onClick={() => onComplete(apt)} className="text-gray-300 hover:text-green-600 p-1.5 hover:bg-green-50 rounded transition-colors" title="Jetzt schon erledigen"><Icons.Check /></button>
                              </div>
                          ))}
                      </div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
};

export const OrdersView = ({ onAdd, onEdit }: any) => {
  const { orders, vehicles, updateOrderStatus, deleteOrder } = useFleet();
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const [showCompleted, setShowCompleted] = useState(false);
  const [orderingOrder, setOrderingOrder] = useState<Order | null>(null);
  const [supplierInput, setSupplierInput] = useState('');

  const filteredOrders = useMemo(() => {
    return orders.filter((o: Order) => {
        if (!showCompleted && o.status === OrderStatus.ERLEDIGT) return false;
        
        // Hide orders for inactive vehicles
        if (o.vehicleId) {
            const vehicle = safeVehicles.find((v:Vehicle) => v.id === o.vehicleId);
            if (vehicle && vehicle.isActive === false) return false;
        }
        
        return true;
    }).sort((a: Order, b: Order) => {
       const vA = safeVehicles.find((v:Vehicle) => v.id === a.vehicleId);
       const vB = safeVehicles.find((v:Vehicle) => v.id === b.vehicleId);
       const plateCompare = (vA?.licensePlate || 'ZZZ').localeCompare(vB?.licensePlate || 'ZZZ');
       if (plateCompare !== 0) return plateCompare;
       return getPrioritySortValue(a.description) - getPrioritySortValue(b.description);
    });
  }, [orders, safeVehicles, showCompleted]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-3 rounded shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800">Bestellungen</h2>
        <div className="flex gap-2">
            <button onClick={() => setShowCompleted(!showCompleted)} className={`p-2 rounded border transition-colors ${showCompleted ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>{showCompleted ? <Icons.Eye /> : <Icons.EyeOff />}</button>
            <button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center gap-2 shadow-sm font-bold text-sm"><Icons.Plus /> Neu</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {filteredOrders.length === 0 && <div className="col-span-full p-12 text-center text-gray-400 italic bg-white rounded shadow border border-gray-200">Keine Bestellungen vorhanden.</div>}
        {filteredOrders.map((o: Order) => {
            const vehicle = safeVehicles.find((v:Vehicle) => v.id === o.vehicleId);
            const isUrgent = o.description.includes('[Dringend]');
            const isLow = o.description.includes('[Niedrig]');
            return (
              <div key={o.id} className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="font-bold text-lg text-gray-800 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{vehicle?.licensePlate || 'Lager/Allgemein'}</span>
                      <div className="flex items-center gap-1">
                          {(isUrgent || isLow) && <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isUrgent ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>{isUrgent ? 'Dringend' : 'Niedrig'}</span>}
                      </div>
                  </div>
                  <div className={`font-normal text-gray-700 whitespace-pre-wrap mb-2 ${o.status === OrderStatus.ERLEDIGT ? 'line-through text-gray-400' : ''}`}>
                      {o.description.replace(/\[Dringend\]|\[Niedrig\]/g, '').trim()}
                  </div>
                  {o.supplier && <div className="text-sm text-blue-600 font-bold mb-2">@ {o.supplier}</div>}
                  <div className="text-[10px] text-gray-400 mt-auto pt-2 border-t border-gray-50">Erstellt: {o.dateAdded}</div>
                </div>
                <div className="bg-gray-50 p-3 border-t border-gray-200 flex items-center justify-between">
                    <div className="flex bg-white p-1 rounded-md gap-1 border border-gray-200 shadow-sm">
                        <StatusButton currentStatus={o.status} targetStatus={OrderStatus.OFFEN} label="Offen" icon={<Icons.Box />} colorClass="bg-white text-gray-700 shadow-sm border-gray-300" onClick={() => updateOrderStatus(o.id, OrderStatus.OFFEN)} />
                        <StatusButton currentStatus={o.status} targetStatus={OrderStatus.ANGEFRAGT} label="Angefragt" icon={<Icons.HelpCircle />} colorClass="bg-yellow-100 text-yellow-700 border-yellow-200" onClick={() => updateOrderStatus(o.id, OrderStatus.ANGEFRAGT)} />
                        <StatusButton currentStatus={o.status} targetStatus={OrderStatus.BESTELLT} label="Bestellt" icon={<Icons.FileText />} colorClass="bg-blue-100 text-blue-700 border-blue-200" onClick={() => {
                            setOrderingOrder(o);
                            setSupplierInput(o.supplier || '');
                        }} />
                        <StatusButton currentStatus={o.status} targetStatus={OrderStatus.ERLEDIGT} label="Erledigt" icon={<Icons.CheckCircle />} colorClass="bg-green-100 text-green-700 border-green-200" onClick={() => updateOrderStatus(o.id, OrderStatus.ERLEDIGT)} />
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => onEdit(o)} className="text-blue-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded bg-white border border-gray-200 shadow-sm" title="Bearbeiten"><Icons.Edit /></button>
                        <button onClick={() => deleteOrder(o.id)} className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded bg-white border border-gray-200 shadow-sm" title="Löschen"><Icons.Trash /></button>
                    </div>
                </div>
              </div>
            );
        })}
      </div>
      
      {orderingOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-200">
                      <h3 className="text-lg font-bold text-gray-800">Lieferant angeben</h3>
                      <p className="text-xs text-gray-500 mt-1">Wo wird dieser Artikel bestellt?</p>
                  </div>
                  <div className="p-4">
                      <input 
                          autoFocus
                          type="text" 
                          placeholder="z.B. Winkler, Wessels, etc."
                          className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                          value={supplierInput} 
                          onChange={e => setSupplierInput(e.target.value)}
                          onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                  updateOrderStatus(orderingOrder.id, OrderStatus.BESTELLT, supplierInput);
                                  setOrderingOrder(null);
                              } else if (e.key === 'Escape') {
                                  setOrderingOrder(null);
                              }
                          }}
                      />
                  </div>
                  <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-end gap-2">
                      <button onClick={() => setOrderingOrder(null)} className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded">Abbrechen</button>
                      <button 
                          onClick={() => {
                              updateOrderStatus(orderingOrder.id, OrderStatus.BESTELLT, supplierInput);
                              setOrderingOrder(null);
                          }} 
                          className="px-4 py-1.5 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm"
                      >
                          Speichern
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
