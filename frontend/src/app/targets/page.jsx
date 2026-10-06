'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import Targets from '../../pages/Targets';

export default function TargetsRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'engineer']}>
      <Targets />
    </ProtectedRoute>
  );
}
