'use client';

import ProtectedRoute from '../../../components/ProtectedRoute';
import AdminUsers from '../../../pages/AdminUsers';

export default function AdminUsersRoute() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminUsers />
    </ProtectedRoute>
  );
}
