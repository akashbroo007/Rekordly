import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { StatusBar } from './status-bar';
import { TitleBar } from './title-bar';
import { Toolbar } from './toolbar';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar />
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
