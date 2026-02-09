import { Outlet, useLocation } from 'react-router-dom';
import { findPageTitle } from '../constants/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const Layout = () => {
  const location = useLocation();
  const title = findPageTitle(location.pathname);

  return (
    <div id="app">
      <Sidebar />
      <div className="main-content">
        <Topbar title={title} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

