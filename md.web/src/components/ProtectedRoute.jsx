import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Loader from './Loader';

const ProtectedRoute = ({ children, requiredRole, requiredPermission }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Yükleniyor
  if (loading) {
    return (
      <div className="protected-loading">
        <Loader text="Yetki kontrol ediliyor..." />
      </div>
    );
  }

  // Giriş yapılmamış
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Rol kontrolü
  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowedRoles.includes(user?.role)) {
      return (
        <div className="access-denied">
          <div className="access-denied-content">
            <span className="access-denied-icon">🚫</span>
            <h2>Erişim Engellendi</h2>
            <p>Bu sayfayı görüntüleme yetkiniz bulunmamaktadır.</p>
            <p className="access-denied-role">Gerekli rol: {allowedRoles.join(' veya ')}</p>
          </div>
        </div>
      );
    }
  }

  // Permission kontrolü
  if (requiredPermission) {
    const userPermissions = user?.permissions || [];
    const hasPermission = Array.isArray(requiredPermission)
      ? requiredPermission.some((p) => userPermissions.includes(p))
      : userPermissions.includes(requiredPermission);
    
    if (!hasPermission && user?.role !== 'admin') {
      return (
        <div className="access-denied">
          <div className="access-denied-content">
            <span className="access-denied-icon">🚫</span>
            <h2>Erişim Engellendi</h2>
            <p>Bu işlem için gerekli izniniz bulunmamaktadır.</p>
          </div>
        </div>
      );
    }
  }

  return children;
};

export default ProtectedRoute;
