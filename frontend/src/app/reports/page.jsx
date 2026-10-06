'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import Reports from '../../pages/Reports';

export default function ReportsRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <Reports />
    </ProtectedRoute>
  );
}
