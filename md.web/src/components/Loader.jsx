/**
 * Generic Loader Component
 * Usage:
 *   <Loader /> - Default centered spinner
 *   <Loader size="small" /> - Small inline spinner
 *   <Loader size="large" text="Yükleniyor..." /> - Large with text
 *   <Loader fullscreen /> - Fullscreen overlay loader
 */

const Loader = ({ size = 'medium', text, fullscreen = false, overlay = false }) => {
  const sizeClasses = {
    small: 'loader-small',
    medium: 'loader-medium',
    large: 'loader-large',
  };

  const spinner = (
    <div className={`loader-spinner ${sizeClasses[size] || sizeClasses.medium}`}>
      <div className="loader-ring">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
      {text && <div className="loader-text">{text}</div>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="loader-fullscreen">
        {spinner}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="loader-overlay">
        {spinner}
      </div>
    );
  }

  return (
    <div className="loader-container">
      {spinner}
    </div>
  );
};

export default Loader;

