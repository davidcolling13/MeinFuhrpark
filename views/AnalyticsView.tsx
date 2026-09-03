import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { startOfYear, endOfDay, startOfDay, format, parseISO, isAfter, isBefore, getMonth, getYear } from 'date-fns';
import { de } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LogEntry, Order, OrderStatus, Vehicle } from '../types';
import { Icons } from '../icons';
import { useFleet } from '../context/FleetContext';

export const AnalyticsView = () => {
    const { vehicles } = useFleet();
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfDay(new Date()), 'yyyy-MM-dd'));

    // Fetch all completed logs
    const { data: logsData, isLoading: loadingLogs } = useQuery({
        queryKey: ['analytics', 'logs', startDate, endDate],
        queryFn: async () => {
            const res = await api.get(`/logs?status=DONE&limit=999999`);
            return res.data || res || [];
        }
    });

    // Fetch all orders
    const { data: ordersData, isLoading: loadingOrders } = useQuery({
        queryKey: ['analytics', 'orders', startDate, endDate],
        queryFn: async () => {
            const res = await api.get('/orders');
            return res || [];
        }
    });

    const isLoading = loadingLogs || loadingOrders;

    // Computed Stats
    const stats = useMemo(() => {
        if (!logsData || !ordersData) return null;

        const start = startOfDay(new Date(startDate));
        const end = endOfDay(new Date(endDate));

        // Filter valid logs within date range
        const validLogs: LogEntry[] = logsData.filter((l: LogEntry) => {
            if (!l.dateCompleted) return false;
            const d = new Date(l.dateCompleted);
            return d >= start && d <= end;
        });

        // Filter valid orders within date range (and completed)
        const validOrders: Order[] = ordersData.filter((o: Order) => {
            if (o.status !== OrderStatus.ERLEDIGT) return false;
            const d = new Date(o.dateAdded); // We use dateAdded for orders if dateCompleted is missing
            return d >= start && d <= end;
        });

        // 1. Total Repairs / Inspections
        const totalRepairs = validLogs.filter(l => l.type === 'Wartung' || l.type === 'Aufgabe').length;
        const totalInspections = validLogs.filter(l => l.type === 'Prüfung').length;

        // 2. Average calculations (over total months in range)
        const diffInMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        const avgRepairs = totalRepairs / diffInMonths;

        // 3. ToDos/Repairs per month for charts
        const monthlyDataMap: Record<string, { name: string; Reparaturen: number; Prüfungen: number }> = {};
        
        let curr = new Date(start);
        while (curr <= end) {
            const mLabel = format(curr, 'MMM yy', { locale: de });
            const mKey = format(curr, 'yyyy-MM');
            if (!monthlyDataMap[mKey]) {
                monthlyDataMap[mKey] = { name: mLabel, Reparaturen: 0, Prüfungen: 0 };
            }
            curr.setMonth(curr.getMonth() + 1);
        }

        validLogs.forEach(l => {
            const key = format(new Date(l.dateCompleted!), 'yyyy-MM');
            if (monthlyDataMap[key]) {
                if (l.type === 'Prüfung') {
                    monthlyDataMap[key].Prüfungen += 1;
                } else {
                    monthlyDataMap[key].Reparaturen += 1;
                }
            }
        });

        const monthlyData = Object.keys(monthlyDataMap).sort().map(k => monthlyDataMap[k]);

        // 4. Vehicles with most/least repairs
        const vehicleCounts: Record<string, number> = {};
        validLogs.forEach(l => {
            if (l.type !== 'Prüfung' && l.vehicleId) {
                vehicleCounts[l.vehicleId] = (vehicleCounts[l.vehicleId] || 0) + 1;
            }
        });

        const vehicleRankings = Object.entries(vehicleCounts)
            .map(([vId, count]) => {
                const v = vehicles.find(vec => vec.id === vId);
                return {
                    vehicle: v ? `${v.licensePlate} (${v.type})` : 'Gelöschtes Fahrzeug',
                    count
                };
            })
            .sort((a, b) => b.count - a.count);

        const topVehicles = vehicleRankings.slice(0, 5);

        // 5. Most ordered articles
        const orderCounts: Record<string, number> = {};
        validOrders.forEach(o => {
            // Rough normalization: lowercase and trim
            if (!o.description) return;
            const normalized = o.description.trim().toLowerCase()
                                .replace(/\[dringend\]/g, '')
                                .replace(/\[niedrig\]/g, '')
                                .trim();
            if (normalized) {
                orderCounts[normalized] = (orderCounts[normalized] || 0) + 1;
            }
        });

        const topArticles = Object.entries(orderCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            totalRepairs,
            totalInspections,
            avgRepairs,
            monthlyData,
            topVehicles,
            topArticles
        };
    }, [logsData, ordersData, startDate, endDate, vehicles]);

    return (
        <div className="space-y-4">
            <div className="bg-white p-3 rounded shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Icons.Chart /> Auswertungen
                </h2>
                
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 border border-gray-300 rounded bg-white px-2 py-1.5 focus-within:border-blue-500">
                        <span className="text-xs text-gray-500">Von:</span>
                        <input type="date" className="text-sm outline-none bg-transparent cursor-pointer" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-1 border border-gray-300 rounded bg-white px-2 py-1.5 focus-within:border-blue-500">
                        <span className="text-xs text-gray-500">Bis:</span>
                        <input type="date" className="text-sm outline-none bg-transparent cursor-pointer" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="p-12 text-center text-gray-400">Analysiere Daten...</div>
            ) : !stats ? (
                <div className="p-12 text-center text-gray-400">Keine Daten verfügbar</div>
            ) : (
                <div className="space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded shadow border border-gray-200 flex items-center justify-between">
                            <div>
                                <div className="text-sm font-bold text-gray-500 uppercase">Erledigte Reparaturen</div>
                                <div className="text-3xl font-black text-slate-800 mt-1">{stats.totalRepairs}</div>
                            </div>
                            <div className="text-blue-100 bg-blue-500 p-3 rounded-full">
                                <Icons.Wrench />
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded shadow border border-gray-200 flex items-center justify-between">
                            <div>
                                <div className="text-sm font-bold text-gray-500 uppercase">Prüfungen (HU/SP/UVV)</div>
                                <div className="text-3xl font-black text-slate-800 mt-1">{stats.totalInspections}</div>
                            </div>
                            <div className="text-purple-100 bg-purple-500 p-3 rounded-full">
                                <Icons.Check />
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded shadow border border-gray-200 flex items-center justify-between">
                            <div>
                                <div className="text-sm font-bold text-gray-500 uppercase">Ø Reparaturen / Monat</div>
                                <div className="text-3xl font-black text-slate-800 mt-1">{stats.avgRepairs.toFixed(1)}</div>
                            </div>
                            <div className="text-green-100 bg-green-500 p-3 rounded-full">
                                <Icons.Calendar />
                            </div>
                        </div>
                    </div>

                    {/* Charts & Lists */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Bar Chart */}
                        <div className="lg:col-span-2 bg-white p-4 rounded shadow border border-gray-200">
                            <h3 className="font-bold text-slate-700 mb-4 uppercase text-sm tracking-wider">Monatliche Auslastung</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                        <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip 
                                            cursor={{fill: '#f8fafc'}}
                                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        />
                                        <Bar dataKey="Reparaturen" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                                        <Bar dataKey="Prüfungen" fill="#a855f7" radius={[4, 4, 0, 0]} stackId="a" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Top Vehicles */}
                            <div className="bg-white p-4 rounded shadow border border-gray-200">
                                <h3 className="font-bold text-slate-700 mb-3 uppercase text-sm tracking-wider">Meiste Reparaturen</h3>
                                <div className="space-y-3">
                                    {stats.topVehicles.length > 0 ? stats.topVehicles.map((tv, idx) => (
                                        <div key={idx} className="flex items-center justify-between px-2 py-1.5 bg-slate-50 border border-slate-100 rounded">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-slate-400 w-4">{idx + 1}.</span>
                                                <span className="text-sm font-bold text-slate-700">{tv.vehicle}</span>
                                            </div>
                                            <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{tv.count}x</span>
                                        </div>
                                    )) : <div className="text-sm text-gray-500 italic">Keine Daten verfügbar</div>}
                                </div>
                            </div>

                            {/* Top Orders */}
                            <div className="bg-white p-4 rounded shadow border border-gray-200">
                                <h3 className="font-bold text-slate-700 mb-3 uppercase text-sm tracking-wider">Oft bestellte Artikel</h3>
                                <div className="space-y-3">
                                    {stats.topArticles.length > 0 ? stats.topArticles.map((ta, idx) => (
                                        <div key={idx} className="flex items-center justify-between px-2 py-1.5 bg-slate-50 border border-slate-100 rounded">
                                            <div className="flex flex-1 min-w-0 mr-3 items-center gap-2">
                                                <span className="text-xs font-black text-slate-400 shrink-0 w-4">{idx + 1}.</span>
                                                <span className="text-sm text-slate-700 truncate capitalize">{ta.name}</span>
                                            </div>
                                            <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full shrink-0">{ta.count}x</span>
                                        </div>
                                    )) : <div className="text-sm text-gray-500 italic">Keine Daten verfügbar</div>}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};
