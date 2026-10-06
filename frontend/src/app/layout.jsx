import '../index.css';
import { AuthProvider } from '../context/AuthContext';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'SHPMFS — Smart Hydro Power Monitoring & Forecasting System',
  description: 'Centralized Hydro Power Monitoring & Forecasting System for PEDO',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased bg-transparent font-sans">
        <AuthProvider>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
