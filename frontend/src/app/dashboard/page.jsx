'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import Dashboard from '../../pages/Dashboard';

export default function DashboardRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'engineer', 'viewer']}>
      <Dashboard />
    </ProtectedRoute>
  );
}
