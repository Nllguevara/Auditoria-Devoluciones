
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  step: number;
  fullWidth?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, step, fullWidth }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      <header className="w-full bg-white border-b border-slate-200 py-4 px-6 mb-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              A
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Auditoria <span className="text-indigo-600">Dev</span></h1>
          </div>
          <div className="flex items-center space-x-2 text-sm font-medium text-slate-500">
            <span className={step >= 1 ? "text-indigo-600" : ""}>Paso {step}</span>
            <span>/</span>
            <span>4</span>
          </div>
        </div>
      </header>

      <main className={`w-full ${fullWidth ? 'max-w-[98%] px-2 md:px-6' : 'max-w-3xl px-6'} pb-20 transition-all duration-300`}>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
        </div>
        {children}
      </main>

      <footer className="fixed bottom-0 w-full bg-white border-t border-slate-200 py-4 px-6 flex justify-center lg:hidden">
         <p className="text-xs text-slate-400 font-medium tracking-widest uppercase">Verified by Gemini AI</p>
      </footer>
    </div>
  );
};
