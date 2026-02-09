import { StatusIcon } from '../utils/muiIcons';

const StatCard = ({ icon, label, value, change, tone = 'primary', trend = 'neutral', title }) => {
  const changeClass = trend === 'negative' ? 'stat-change negative' : 'stat-change positive';
  const iconEl = typeof icon === 'string' ? <StatusIcon icon={icon} fontSize="medium" /> : icon;

  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{iconEl}</div>
      <div className="stat-content">
        <div className="stat-label">{label || title}</div>
        <div className="stat-value">{value}</div>
        {change ? <div className={changeClass}>{change}</div> : null}
      </div>
    </div>
  );
};

export default StatCard;

