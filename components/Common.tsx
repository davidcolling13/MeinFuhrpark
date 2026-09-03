import { Component, ReactNode } from 'react';
import { parseDateMMYYYY } from '../utils';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
    children?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: any;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  
  componentDidCatch(error: any, errorInfo: any) { console.error("Uncaught Error:", error, errorInfo); }
  
  render() {
    if (this.state.hasError) {
      return (
          <div className="p-8 text-center">
              <h1 className="text-2xl font-bold text-red-600 mb-4">Ein Fehler ist aufgetreten</h1>
              <div className="bg-red-50 p-4 rounded border border-red-200 text-left inline-block max-w-2xl overflow-auto">
                  <p className="font-mono text-sm text-red-800">{this.state.error?.message}</p>
              </div>
              <div className="mt-4">
                  <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded">Seite neu laden</button>
              </div>
          </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- UI HELPERS ---

export const ModalOverlay = ({ isOpen, onClose, children, maxWidth = 'max-w-lg' }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`bg-white rounded-lg shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}>
                {children}
            </div>
            <div className="absolute inset-0 -z-10" onClick={onClose}></div>
        </div>
    );
};

export const NavButton = ({ icon, label, active, onClick }: any) => (
    <button 
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded transition-colors font-medium ${active ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

export const DateCell = ({ date }: { date?: string }) => {
    if (!date) return <span className="text-gray-300">-</span>;
    const isOverdue = parseDateMMYYYY(date) < Date.now();
    return (
        <span className={`font-mono font-bold ${isOverdue ? 'text-red-600' : 'text-green-700'}`}>
            {date}
        </span>
    );
};
