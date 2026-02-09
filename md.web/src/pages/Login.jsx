import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Loader from '../components/Loader';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading } = useAuth();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Zaten giriş yapılmışsa yönlendir
  useEffect(() => {
    if (isAuthenticated && !loading) {
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, loading, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('Kullanıcı adı gerekli');
      return;
    }
    
    if (!password) {
      setError('Şifre gerekli');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const result = await login(username.trim(), password);
      
      if (result.success) {
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      } else {
        setError(result.message || 'Giriş başarısız');
      }
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-loading">
          <Loader text="Oturum kontrol ediliyor..." />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo / Branding */}
        <div className="login-header">
          <div className="login-logo">
            <span className="login-logo-icon">🏗️</span>
            <h1 className="login-title">PVC Yönetim Sistemi</h1>
          </div>
          <p className="login-subtitle">İş takip ve yönetim paneli</p>
        </div>

        {/* Login Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error">
              <span className="login-error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="username" className="login-label">
              <span className="login-label-icon">👤</span>
              Kullanıcı Adı
            </label>
            <input
              id="username"
              type="text"
              className="login-input"
              data-testid="input-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adınızı girin"
              autoComplete="username"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">
              <span className="login-label-icon">🔒</span>
              Şifre
            </label>
            <div className="login-password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                data-testid="input-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrenizi girin"
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={submitting}
            data-testid="btn-login"
          >
            {submitting ? (
              <>
                <span className="login-spinner"></span>
                Giriş yapılıyor...
              </>
            ) : (
              <>
                <span>🔐</span>
                Giriş Yap
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p>Varsayılan: admin / admin</p>
        </div>
      </div>

      {/* Background decoration */}
      <div className="login-bg-decoration">
        <div className="login-bg-shape login-bg-shape-1"></div>
        <div className="login-bg-shape login-bg-shape-2"></div>
        <div className="login-bg-shape login-bg-shape-3"></div>
      </div>
    </div>
  );
};

export default Login;
