import Dashboard from './pages/Dashboard';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#fff',
            color: '#1a1a1a',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
        }}
      />
      <ErrorBoundary fallback={null}>
        <Dashboard />
      </ErrorBoundary>
    </>
  );
}
