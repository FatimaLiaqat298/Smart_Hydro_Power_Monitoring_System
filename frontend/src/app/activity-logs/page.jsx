'use client';

import ProtectedRoute from '../../components/ProtectedRoute';
import ActivityLogs from '../../pages/ActivityLogs';

export default function ActivityLogsRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <ActivityLogs />
    </ProtectedRoute>
  );
}
