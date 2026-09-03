import React from 'react';
import { NavButton } from './Common';
import { Icons } from '../icons';
import { getIsOfflineMode } from '../api';

interface LayoutProps {
    children?: React.ReactNode;
    currentView: string;
    setView: (view: string) => void;
    onRefresh: () => void;
}

export const Layout = ({ children, currentView, setView, onRefresh }: LayoutProps) => {
    return (
        <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden print:h-auto print:overflow-visible print:bg-white">
            {/* Sidebar */}
            <div className="w-64 bg-slate-800 text-white flex flex-col shadow-xl z-10 no-print shrink-0">
                <div className="p-6 border-b border-slate-700">
                    <h1 className="text-xl font-bold tracking-tight">Fuhrpark<span className="text-blue-400">Manager</span></h1>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <NavButton icon={<Icons.Dashboard />} label="ToDo" active={currentView === 'dashboard'} onClick={() => setView('dashboard')} />
                    <NavButton icon={<Icons.Calendar />} label="Termine" active={currentView === 'appointments'} onClick={() => setView('appointments')} />
                    <NavButton icon={<Icons.ShoppingCart />} label="Bestellungen" active={currentView === 'orders'} onClick={() => setView('orders')} />
                    <NavButton icon={<Icons.History />} label="Historie" active={currentView === 'history'} onClick={() => setView('history')} />
                    <NavButton icon={<Icons.Chart />} label="Auswertungen" active={currentView === 'analytics'} onClick={() => setView('analytics')} />
                    <NavButton icon={<Icons.Link />} label="Gespanne" active={currentView === 'combinations'} onClick={() => setView('combinations')} />
                    <NavButton icon={<Icons.Truck />} label="Fahrzeuge" active={currentView === 'vehicles'} onClick={() => setView('vehicles')} />
                    <div className="pt-4 mt-4 border-t border-slate-700">
                        <NavButton icon={<Icons.Database />} label="Admin" active={currentView === 'admin'} onClick={() => setView('admin')} />
                    </div>
                </nav>
                <div className="p-4 border-t border-slate-700 text-xs text-slate-400">v2.6.0 • {getIsOfflineMode() ? 'Offline Mode' : 'Online'}</div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden print:h-auto print:overflow-visible">
                <header className="bg-white shadow-sm border-b px-8 py-4 flex justify-between items-center no-print shrink-0">
                     <h2 className="text-xl font-bold text-gray-800 capitalize">{currentView === 'dashboard' ? 'ToDo' : currentView}</h2>
                     <button onClick={onRefresh} className="p-2 text-gray-500 hover:bg-gray-100 rounded" title="Refresh"><Icons.History /></button>
                </header>
                
                <main className="flex-1 overflow-auto p-8 print:overflow-visible print:p-0">
                    {children}
                </main>
            </div>
        </div>
    );
};