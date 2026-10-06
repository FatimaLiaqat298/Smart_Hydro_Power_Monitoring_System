'use client';
import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { 
  UserPlus, Search, Shield, ToggleLeft, ToggleRight, 
  Pencil, Eye, EyeOff, X, Users, CheckCircle, ShieldAlert, Trash2
} from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  // Form states (Add User)
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    role: 'engineer',
    password: '',
    confirmPassword: ''
  });
  
  // Form states (Edit User)
  const [editForm, setEditForm] = useState({
    name: '',
    role: 'engineer',
    is_active: true
  });

  // Show/Hide Password states
  const [showAddPass, setShowAddPass] = useState(false);
  const [showAddConfirmPass, setShowAddConfirmPass] = useState(false);

  // Form Error States (Add User)
  const [errors, setErrors] = useState({});

  // Fetch all users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users', { params: { page_size: 100 } });
      // users returns { success, data: [], pagination }
      const usersArr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setUsers(usersArr);
    } catch (err) {
      console.error('Failed to load user listing:', err);
      toast.error('Failed to load users accounts.');
    } finally {
      setLoading(false);
    }
  };

  // Form input validation helper for Add User (Realtime / Blur / Submit)
  const validateField = (name, value, allValues = addForm) => {
    let error = '';
    
    if (name === 'name' && value.trim() === '') {
      error = 'Full name is required';
    }
    
    if (name === 'email') {
      if (value.trim() === '') {
        error = 'Email address is required';
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          error = 'Invalid email address format';
        }
      }
    }
    
    if (name === 'password') {
      if (value === '') {
        error = 'Password is required';
      } else if (value.length < 8) {
        error = 'Password must be at least 8 characters';
      } else {
        const hasNumber = /\d/.test(value);
        if (!hasNumber) {
          error = 'Password must contain at least 1 number';
        }
      }
    }
    
    if (name === 'confirmPassword') {
      if (value === '') {
        error = 'Confirm password is required';
      } else if (value !== allValues.password) {
        error = 'Passwords do not match';
      }
    }

    setErrors(prev => ({
      ...prev,
      [name]: error
    }));

    return error;
  };

  const handleAddInputChange = (e) => {
    const { name, value } = e.target;
    setAddForm(prev => {
      const updated = { ...prev, [name]: value };
      // Perform matching check dynamically
      if (name === 'password' && prev.confirmPassword) {
        validateField('confirmPassword', prev.confirmPassword, updated);
      }
      return updated;
    });
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  // Create User Submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    
    // Check all fields
    const errs = {
      name: validateField('name', addForm.name),
      email: validateField('email', addForm.email),
      password: validateField('password', addForm.password),
      confirmPassword: validateField('confirmPassword', addForm.confirmPassword)
    };

    const hasErrors = Object.values(errs).some(er => er !== '');
    if (hasErrors) {
      toast.error('Please resolve all validation errors.');
      return;
    }

    try {
      const payload = {
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        role: addForm.role
      };
      
      const res = await api.post('/users', payload);
      const result = res.data?.data || res.data;
      if (result.email_sent) {
        toast.success(`Account created and credentials emailed to ${addForm.email}.`);
      } else {
        toast.error(`Account created, but email was not sent. Configure SMTP_USER and SMTP_PASSWORD to deliver credentials to ${addForm.email}.`);
      }
      
      // Reset & Close
      setAddForm({
        name: '',
        email: '',
        role: 'engineer',
        password: '',
        confirmPassword: ''
      });
      setErrors({});
      setIsAddModalOpen(false);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to create user account.');
    }
  };

  // Open Edit modal
  const openEditModal = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      role: user.role,
      is_active: user.is_active
    });
    setIsEditModalOpen(true);
  };

  // Edit User Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.patch(`/users/${selectedUser.id}`, {
        role: editForm.role
      });
      toast.success('User updated successfully!');
      setIsEditModalOpen(false);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update user.');
    }
  };

  // Soft Deactivate / Activate Toggle
  const handleToggleActive = async (user) => {
    // Prevent deactivating yourself
    const savedUserStr = localStorage.getItem('user');
    const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
    if (savedUser && savedUser.id === user.id) {
      toast.error('You cannot deactivate your own account.');
      return;
    }

    const isActive = user.status === 'active';
    const newStatus = isActive ? 'deactivated' : 'active';

    try {
      await api.patch(`/users/${user.id}/status`, { status: newStatus });
      toast.success(`Account for ${user.name} is now ${isActive ? 'Deactivated' : 'Active'}`);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error('Failed to toggle status.');
    }
  };

  const handleDeleteUser = async (user) => {
    const savedUserStr = localStorage.getItem('user');
    const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
    if (savedUser?.id === user.id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    if (!window.confirm(`Permanently delete ${user.name} (${user.email})? This cannot be undone.`)) return;

    setDeletingUserId(user.id);
    try {
      await api.delete(`/users/${user.id}`);
      toast.success(`Deleted ${user.name}'s account.`);
      await loadUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to delete user account.');
    } finally {
      setDeletingUserId(null);
    }
  };

  // ── Role branding definitions (Aurora Tokens) ──
  const roleStyles = {
    admin: { bg: 'bg-pedo-primary/15 text-status-shutdown border border-pedo-primary/40', circle: 'bg-pedo-primary text-white border border-red-500/20' },
    manager: { bg: 'bg-pedo-accent/15 text-pedo-accent border border-pedo-accent/40', circle: 'bg-pedo-accent text-white border border-cyan-500/20' },
    engineer: { bg: 'bg-pedo-primary/15 text-status-running border border-status-running/40', circle: 'bg-pedo-primary text-white border border-green-500/20' },
    viewer: { bg: 'bg-card/15 text-muted border border-subtle', circle: 'bg-card text-white border border-gray-500/20' }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  // ── Stats Calculations ──
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.status === 'active').length;
    const admins = users.filter(u => u.role === 'admin').length;
    const engineers = users.filter(u => u.role === 'engineer').length;
    return { total, active, admins, engineers };
  }, [users]);

  // ── Local Search & Filters ──
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && u.status === 'active') || 
                          (statusFilter === 'inactive' && u.status !== 'active');

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  // Pagination slice
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;

  // Determine if Add Form has any error
  const isAddSubmitDisabled = useMemo(() => {
    const hasEmptyField = !addForm.name || !addForm.email || !addForm.password || !addForm.confirmPassword;
    const hasAnyError = Object.values(errors).some(e => e !== '');
    return hasEmptyField || hasAnyError;
  }, [addForm, errors]);

  return (
    <DashboardLayout title="User Management">
      <div className="flex flex-col gap-6">
        
        {/* ================= TOP SECTION ================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-widest">Administrative Control</p>
            <h2 className="text-xl font-extrabold text-white mt-1">Authorized Accounts</h2>
          </div>
          <button 
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="btn-primary"
          >
            <UserPlus size={16} aria-hidden="true" />
            Create Account
          </button>
        </div>

        {/* ================= STATS ROW (4 small cards) ================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Accounts" value={stats.total} icon={Users} color="border-l-pedo-accent" />
          <StatCard label="Active Accounts" value={stats.active} icon={CheckCircle} color="border-l-status-running" />
          <StatCard label="Administrators" value={stats.admins} icon={Shield} color="border-l-pedo-primary" />
          <StatCard label="System Engineers" value={stats.engineers} icon={ShieldAlert} color="border-l-yellow-500" />
        </div>

        {/* ================= FILTER & SEARCH BAR ================= */}
        <div className="bg-card border border-subtle rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="usr-search" className="sr-only">Search users by name or email</label>
            <input
              id="usr-search"
              type="search"
              placeholder="Search users by name or email..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full bg-hull border border-subtle focus:border-pedo-accent rounded-lg py-2 pl-10 pr-4 text-xs text-white placeholder-gray-500 outline-none focus-visible:ring-2 focus-visible:ring-pedo-accent"
            />
            <Search size={14} className="text-gray-500 absolute left-3.5 top-3 pointer-events-none" aria-hidden="true" />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Role Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="usr-role-flt" className="text-xs text-muted font-semibold">Role:</label>
              <select
                id="usr-role-flt"
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
                className="text-xs bg-[#0d2137] border border-subtle focus:border-pedo-accent rounded-lg px-3 py-1.5 font-semibold text-white outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-pedo-accent"
              >
                <option value="all" className="bg-[#0d2137] text-white">All Roles</option>
                <option value="admin" className="bg-[#0d2137] text-white">Admin</option>
                <option value="manager" className="bg-[#0d2137] text-white">Manager</option>
                <option value="engineer" className="bg-[#0d2137] text-white">Engineer</option>
                <option value="viewer" className="bg-[#0d2137] text-white">Viewer</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="usr-status-flt" className="text-xs text-muted font-semibold">Status:</label>
              <select
                id="usr-status-flt"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="text-xs bg-[#0d2137] border border-subtle focus:border-pedo-accent rounded-lg px-3 py-1.5 font-semibold text-white outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-pedo-accent"
              >
                <option value="all" className="bg-[#0d2137] text-white">All Statuses</option>
                <option value="active" className="bg-[#0d2137] text-white">Active</option>
                <option value="inactive" className="bg-[#0d2137] text-white">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* ================= USERS TABLE ================= */}
        <div className="bg-card border border-subtle rounded-xl shadow-2xl overflow-hidden">
          <div className="table-scroll-wrap max-h-[500px]">
            <table className="table-aurora">
              <thead>
                <tr>
                  <th>Account Holder</th>
                  <th>Email Address</th>
                  <th>Access Level</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5}><div className="skeleton h-6 rounded w-full" /></td>
                    </tr>
                  ))
                ) : paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500 font-semibold">
                      No matching user accounts cataloged.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-raise/50 transition-colors group">
                      
                      {/* Avatar + Name */}
                      <td className="px-6 py-3 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-[11px] glow-cyan ${roleStyles[u.role]?.circle || 'bg-gray-700 text-white'}`}>
                          {getInitials(u.name)}
                        </div>
                        <span className="font-bold text-white group-hover:text-pedo-accent transition-colors">{u.name}</span>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-3 text-muted font-semibold">{u.email}</td>

                      {/* Role Badge */}
                      <td className="px-6 py-3">
                        <span className={`text-[9px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider ${roleStyles[u.role]?.bg || 'bg-gray-800'}`}>
                          {u.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-3">
                        {u.status === 'active' ? (
                          <span className="text-status-running font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-ping" />
                            Active
                          </span>
                        ) : u.status === 'suspended' ? (
                          <span className="text-yellow-400 font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                            Suspended
                          </span>
                        ) : (
                          <span className="text-gray-500 font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="flex items-center gap-2">
                        {/* Edit Icon */}
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          title="Edit Account"
                          aria-label={`Edit account for ${u.name}`}
                          className="p-1.5 rounded bg-hull border border-subtle hover:border-pedo-accent text-pedo-accent transition cursor-pointer focus-visible:ring-2 focus-visible:ring-pedo-accent"
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>

                        {/* Toggle active state */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          title={u.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                          aria-label={u.status === 'active' ? `Deactivate account for ${u.name}` : `Activate account for ${u.name}`}
                          className={`p-1.5 rounded bg-hull border ${
                            u.status === 'active'
                              ? 'border-red-500/30 text-red-400 hover:border-red-500' 
                              : 'border-green-500/30 text-green-400 hover:border-green-500'
                          } transition cursor-pointer focus-visible:ring-2 focus-visible:ring-pedo-accent`}
                        >
                          {u.status === 'active' ? <ToggleRight size={14} aria-hidden="true" /> : <ToggleLeft size={14} aria-hidden="true" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          title="Delete Account"
                          aria-label={`Delete account for ${u.name}`}
                          disabled={deletingUserId === u.id}
                          className="p-1.5 rounded bg-hull border border-red-500/30 text-red-400 hover:border-red-500 disabled:opacity-50 transition cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ================= PAGINATION CONTROLS ================= */}
          <div className="bg-hull px-6 py-3.5 flex items-center justify-between border-t border-subtle text-xs">
            <span className="text-muted font-semibold">
              Showing Page <b className="text-white">{currentPage}</b> of <b className="text-white">{totalPages}</b> ({filteredUsers.length} total users)
            </span>

            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="bg-card border border-subtle hover:border-subtle text-white font-bold py-1 px-3.5 rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="bg-card border border-subtle hover:border-subtle text-white font-bold py-1 px-3.5 rounded disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* ================= MODAL: CREATE USER ================= */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-card border border-subtle rounded-2xl w-full max-w-lg shadow-2xl p-6 sm:p-8 animate-fadeIn relative">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white absolute right-4 top-4 transition cursor-pointer"
              >
                <X size={18} />
              </button>

              <h3 className="text-lg font-bold text-white mb-1.5">Create New Account</h3>
              <p className="text-xs text-muted border-b border-subtle pb-4 mb-5">
                Register administrative, engineering, and reporting credentials
              </p>

              <form onSubmit={handleAddSubmit} noValidate className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={addForm.name}
                    onChange={handleAddInputChange}
                    onBlur={handleBlur}
                    placeholder="e.g. Sana Ahmed"
                    className={`w-full bg-hull border ${errors.name ? 'border-red-500' : 'border-subtle'} focus:border-subtle rounded-lg py-2.5 px-3.5 text-xs text-white outline-none focus:ring-1 focus:ring-pedo-accent/30`}
                  />
                  {errors.name && <p className="text-[10px] text-red-400 mt-1">{errors.name}</p>}
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={addForm.email}
                    onChange={handleAddInputChange}
                    onBlur={handleBlur}
                    placeholder="e.g. sana@pedo.gov.pk"
                    className={`w-full bg-hull border ${errors.email ? 'border-red-500' : 'border-subtle'} focus:border-subtle rounded-lg py-2.5 px-3.5 text-xs text-white outline-none focus:ring-1 focus:ring-pedo-accent/30`}
                  />
                  {errors.email && <p className="text-[10px] text-red-400 mt-1">{errors.email}</p>}
                </div>

                {/* Role */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Access Role *
                  </label>
                  <select
                    name="role"
                    value={addForm.role}
                    onChange={handleAddInputChange}
                    className="w-full bg-[#0d2137] border border-subtle focus:border-subtle rounded-lg py-2.5 px-3.5 text-xs text-white outline-none cursor-pointer focus:ring-1 focus:ring-pedo-accent/30"
                  >
                    <option value="admin" className="bg-[#0d2137] text-white">Admin</option>
                    <option value="manager" className="bg-[#0d2137] text-white">Manager</option>
                    <option value="engineer" className="bg-[#0d2137] text-white">Engineer</option>
                    <option value="viewer" className="bg-[#0d2137] text-white">Viewer</option>
                  </select>
                </div>

                {/* Temporary Password */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Temporary Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showAddPass ? 'text' : 'password'}
                      name="password"
                      value={addForm.password}
                      onChange={handleAddInputChange}
                      onBlur={handleBlur}
                      placeholder="Min 8 chars, 1 number"
                      className={`w-full bg-hull border ${errors.password ? 'border-red-500' : 'border-subtle'} focus:border-subtle rounded-lg py-2.5 px-3.5 pr-10 text-xs text-white outline-none focus:ring-1 focus:ring-pedo-accent/30`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddPass(!showAddPass)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-white"
                    >
                      {showAddPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {errors.password && <p className="text-[10px] text-red-400 mt-1">{errors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showAddConfirmPass ? 'text' : 'password'}
                      name="confirmPassword"
                      value={addForm.confirmPassword}
                      onChange={handleAddInputChange}
                      onBlur={handleBlur}
                      placeholder="Must match password"
                      className={`w-full bg-hull border ${errors.confirmPassword ? 'border-red-500' : 'border-subtle'} focus:border-subtle rounded-lg py-2.5 px-3.5 pr-10 text-xs text-white outline-none focus:ring-1 focus:ring-pedo-accent/30`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddConfirmPass(!showAddConfirmPass)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-white"
                    >
                      {showAddConfirmPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-[10px] text-red-400 mt-1">{errors.confirmPassword}</p>}
                </div>

                {/* Submit Block */}
                <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddSubmitDisabled}
                    className="btn-primary"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL: EDIT USER ================= */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-subtle rounded-2xl w-full max-w-md shadow-2xl p-6 sm:p-8 animate-fadeIn relative">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-white absolute right-4 top-4 transition cursor-pointer"
              >
                <X size={18} />
              </button>

              <h3 className="text-lg font-bold text-white mb-1.5">Modify Credentials</h3>
              <p className="text-xs text-muted border-b border-subtle pb-4 mb-5">
                Updating settings for <b>{selectedUser?.email}</b>
              </p>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    disabled
                    className="w-full bg-hull border border-subtle rounded-lg py-2.5 px-3.5 text-xs text-gray-500 outline-none cursor-not-allowed"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">
                    Access Level
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-[#0d2137] border border-subtle focus:border-subtle rounded-lg py-2.5 px-3.5 text-xs text-white outline-none cursor-pointer focus:ring-1 focus:ring-pedo-accent/30"
                  >
                    <option value="admin" className="bg-[#0d2137] text-white">Admin</option>
                    <option value="manager" className="bg-[#0d2137] text-white">Manager</option>
                    <option value="engineer" className="bg-[#0d2137] text-white">Engineer</option>
                    <option value="viewer" className="bg-[#0d2137] text-white">Viewer</option>
                  </select>
                </div>

                {/* Submit Block */}
                <div className="flex justify-end gap-3 pt-4 border-t border-subtle">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Stat Card Helper
// ═════════════════════════════════════════════════════════════════════
function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className={`bg-card border border-subtle border-l-4 ${color} rounded-xl p-4 shadow-lg flex items-center justify-between`}>
      <div>
        <span className="text-[10px] font-bold text-muted uppercase tracking-widest leading-none block mb-2">
          {label}
        </span>
        <span className="text-xl font-black text-white">{value}</span>
      </div>
      <div className="h-9 w-9 rounded-lg bg-hull flex items-center justify-center text-pedo-accent border border-subtle glow-cyan">
        <Icon size={18} />
      </div>
    </div>
  );
}

