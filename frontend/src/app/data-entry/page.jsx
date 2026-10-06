'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import DataEntry from '../../pages/DataEntry';

export default function DataEntryRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'engineer']}>
      <DataEntry />
    </ProtectedRoute>
  );
}
