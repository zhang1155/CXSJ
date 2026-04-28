import type { ReactNode } from 'react';
import Navbar from './Navbar';

interface MainLayoutProps {
  children: ReactNode;
  fullHeight?: boolean;
}

export default function MainLayout({ children, fullHeight = false }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className={`flex-1 pt-14 ${fullHeight ? 'flex flex-col overflow-hidden' : ''}`}>
        {children}
      </main>
    </div>
  );
}

