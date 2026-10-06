'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import Forecast from '../../pages/Forecast';

export default function ForecastRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'engineer']}>
      <Forecast />
    </ProtectedRoute>
  );
}
