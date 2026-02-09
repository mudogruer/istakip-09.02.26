const PageHeader = ({ title, subtitle, actions }) => (
  <div className="page-header">
    <div className="page-header-top">
      <h2 className="page-title">{title}</h2>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
    {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
  </div>
);

export default PageHeader;

