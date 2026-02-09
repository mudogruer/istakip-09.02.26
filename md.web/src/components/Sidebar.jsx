import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS, normalizePath } from '../constants/navigation';
import { NavIcon, UIIcon } from '../utils/muiIcons';

const Sidebar = () => {
  const location = useLocation();
  const activePath = useMemo(() => normalizePath(location.pathname), [location.pathname]);

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const [openGroups, setOpenGroups] = useState(() => {
    const stored = localStorage.getItem('navOpenGroups');
    return stored ? JSON.parse(stored) : {};
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed);
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem('navOpenGroups', JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    const parentPaths = findParentPaths(activePath);
    if (parentPaths.length > 0) {
      setOpenGroups((prev) => {
        const newGroups = { ...prev };
        parentPaths.forEach(p => { newGroups[p] = true; });
        return newGroups;
      });
    }
  }, [activePath]);

  const toggleGroup = (path) => {
    setOpenGroups((prev) => {
      const newGroups = { ...prev };
      // Aktif child varsa, kapatmayı engelleme (kullanıcı manuel toggle edebilir)
      // Ama açıldığında açık kalsın
      newGroups[path] = !newGroups[path];
      return newGroups;
    });
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} id="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">İT</div>
          <div className="sidebar-logo-text">İş Takip Paneli</div>
        </div>
        <button
          className="sidebar-toggle"
          id="sidebarToggle"
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label="Kenar çubuğunu küçült"
        >
          <span className="nav-link-icon"><UIIcon name="menu" /></span>
        </button>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((section) => (
          <div className="nav-section" key={section.section}>
            <div className="nav-section-title">{section.section}</div>
            {section.items.map((item) =>
              item.collapsible ? (
                <CollapsibleItem
                  key={item.path}
                  item={item}
                  openGroups={openGroups}
                  activePath={activePath}
                  onToggle={toggleGroup}
                  level={1}
                />
              ) : (
                <NavLink key={item.path} item={item} isActive={activePath === normalizePath(item.path)} />
              )
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
};

const renderNavIcon = (icon, wrapperClassName) => {
  if (!icon) return null;
  return (
    <span className={wrapperClassName}>
      <NavIcon name={icon} />
    </span>
  );
};

const NavLink = ({ item, isActive }) => (
  <div className="nav-item">
    <Link
      to={item.path}
      className={`nav-link ${isActive ? 'active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {renderNavIcon(item.icon, 'nav-link-icon')}
      <span className="nav-link-text">{item.label}</span>
    </Link>
  </div>
);

const CollapsibleItem = ({ item, openGroups, activePath, onToggle, level = 1 }) => {
  const isParentActive = normalizePath(item.path) === activePath;
  const hasActiveChild = checkActiveDescendant(item, activePath);
  
  // Kullanıcı manuel toggle etmişse onu kullan, yoksa aktif child varsa otomatik açık olsun
  const userToggled = openGroups[item.path] !== undefined;
  const shouldAutoOpen = hasActiveChild || isParentActive;
  const open = userToggled ? openGroups[item.path] : shouldAutoOpen;

  return (
    <div className={`nav-collapsible ${open ? 'open' : ''}`} style={{ marginLeft: level > 1 ? 8 : 0 }}>
      <button
        type="button"
        className={`nav-collapsible-trigger ${isParentActive ? 'active' : ''}`}
        onClick={() => onToggle(item.path)}
        aria-expanded={open}
        style={{ paddingLeft: level > 1 ? 24 : undefined }}
      >
        {item.icon ? (
          renderNavIcon(item.icon, 'nav-collapsible-icon')
        ) : (
          <span className="nav-collapsible-icon">{level > 1 ? '◦' : '•'}</span>
        )}
        <span className="nav-collapsible-text">{item.label}</span>
        <span className="nav-collapsible-arrow">
          <UIIcon name="chevron_right" fontSize="inherit" />
        </span>
      </button>
      {open && (
        <div className="nav-collapsible-content">
          {item.children?.map((child) => {
            // Eğer child'ın da children'ı varsa, nested collapsible yap
            if (child.children && child.children.length > 0) {
              return (
                <CollapsibleItem
                  key={child.path}
                  item={child}
                  openGroups={openGroups}
                  activePath={activePath}
                  onToggle={onToggle}
                  level={level + 1}
                />
              );
            }
            
            const childActive = normalizePath(child.path) === activePath;
            return (
              <div className="nav-item" key={child.path}>
                <Link
                  to={child.path}
                  className={`nav-link ${childActive ? 'active' : ''}`}
                  aria-current={childActive ? 'page' : undefined}
                  style={{ paddingLeft: level > 1 ? 32 : undefined }}
                >
                  <span className="nav-link-icon">{level > 1 ? '›' : '•'}</span>
                  <span className="nav-link-text">{child.label}</span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Aktif child veya grandchild var mı kontrol et
const checkActiveDescendant = (item, activePath) => {
  if (!item.children) return false;
  
  for (const child of item.children) {
    if (normalizePath(child.path) === activePath) return true;
    if (child.children && checkActiveDescendant(child, activePath)) return true;
  }
  return false;
};

// Tüm parent path'leri bul (3 seviye için)
const findParentPaths = (path) => {
  const normalized = normalizePath(path);
  const parents = [];

  NAV_ITEMS.forEach((section) => {
    section.items.forEach((item) => {
      if (item.children) {
        item.children.forEach((child) => {
          if (normalizePath(child.path) === normalized) {
            parents.push(item.path);
          }
          if (child.children) {
            child.children.forEach((grandchild) => {
              if (normalizePath(grandchild.path) === normalized) {
                parents.push(item.path);
                parents.push(child.path);
              }
            });
          }
        });
      }
    });
  });

  return parents;
};

export default Sidebar;
