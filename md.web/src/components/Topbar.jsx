import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NavIcon, UIIcon } from '../utils/muiIcons';

const Topbar = ({ title }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Dışarı tıklayınca menüyü kapat
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getInitials = () => {
    if (!user?.displayName) return 'U';
    const parts = user.displayName.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.displayName.substring(0, 2).toUpperCase();
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Yönetici',
      manager: 'Müdür',
      user: 'Kullanıcı',
    };
    return labels[role] || role || 'Kullanıcı';
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <div className="topbar-search">
          <span className="topbar-search-icon">
            <UIIcon name="search" />
          </span>
          <input
            type="search"
            placeholder="Ara..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Uygulama içi arama"
          />
        </div>
        <div className="topbar-user-wrapper" ref={menuRef}>
          <button
            className="topbar-user"
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div className="topbar-user-avatar">{getInitials()}</div>
            <div className="topbar-user-info">
              <div className="topbar-user-name">{user?.displayName || 'Kullanıcı'}</div>
              <div className="topbar-user-role">{getRoleLabel(user?.role)}</div>
            </div>
            <span className="topbar-user-chevron">
              <UIIcon name={showUserMenu ? 'expand_less' : 'expand_more'} />
            </span>
          </button>
          {showUserMenu && (
            <div className="topbar-user-menu">
              <div className="topbar-user-menu-header">
                <span className="topbar-user-menu-icon">
                  <UIIcon name="person" />
                </span>
                <div>
                  <div className="topbar-user-menu-name">{user?.displayName}</div>
                  <div className="topbar-user-menu-username">@{user?.username}</div>
                </div>
              </div>
              <div className="topbar-user-menu-divider"></div>
              <button
                className="topbar-user-menu-item"
                onClick={() => { navigate('/aktiviteler'); setShowUserMenu(false); }}
              >
                <NavIcon name="monitoring" />
                Aktivite Logları
              </button>
              <button
                className="topbar-user-menu-item"
                onClick={() => { navigate('/ayarlar'); setShowUserMenu(false); }}
              >
                <NavIcon name="settings" />
                Ayarlar
              </button>
              <div className="topbar-user-menu-divider"></div>
              <button
                className="topbar-user-menu-item danger"
                onClick={handleLogout}
              >
                <UIIcon name="logout" />
                Çıkış Yap
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;

