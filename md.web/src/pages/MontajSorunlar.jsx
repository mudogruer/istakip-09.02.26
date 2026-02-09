import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import {
  getAssemblyTasks,
  resolveAssemblyIssue,
  getSettingsAll,
} from '../services/dataService';

// Fallback değerler (settings yüklenemezse)
const DEFAULT_ISSUE_TYPES_MAP = {
  broken: { label: 'Kırık/Hasarlı', icon: '💔' },
  missing: { label: 'Eksik Malzeme', icon: '❓' },
  wrong: { label: 'Yanlış Ürün', icon: '❌' },
  damage: { label: 'Hasar', icon: '⚠️' },
  other: { label: 'Diğer', icon: '📝' },
};

const DEFAULT_FAULT_SOURCES_MAP = {
  production: { label: 'Üretim Hatası', color: 'var(--warning)' },
  team: { label: 'Ekip Hatası', color: 'var(--danger)' },
  accident: { label: 'Kaza', color: 'var(--info)' },
};

// Source colors for display
const FAULT_SOURCE_COLORS = {
  production: 'var(--warning)',
  supplier: 'var(--warning)',
  transport: 'var(--info)',
  team: 'var(--danger)',
  measurement: 'var(--primary)',
  customer: 'var(--secondary)',
  accident: 'var(--info)',
};

const MontajSorunlar = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Settings'den çekilen config
  const [issueTypesMap, setIssueTypesMap] = useState(DEFAULT_ISSUE_TYPES_MAP);
  const [faultSourcesMap, setFaultSourcesMap] = useState(DEFAULT_FAULT_SOURCES_MAP);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksData, settingsData] = await Promise.all([
        getAssemblyTasks({}),
        getSettingsAll().catch(() => ({})),
      ]);
      setTasks(tasksData || []);
      
      // Settings'den issue types map oluştur
      if (settingsData?.issueTypes?.length) {
        const newMap = {};
        settingsData.issueTypes.forEach(it => {
          newMap[it.id] = { label: it.name, icon: it.icon || '❓' };
        });
        setIssueTypesMap(newMap);
      }
      
      // Settings'den fault sources map oluştur
      if (settingsData?.faultSources?.length) {
        const newMap = {};
        settingsData.faultSources.forEach(fs => {
          newMap[fs.id] = { 
            label: fs.name, 
            color: FAULT_SOURCE_COLORS[fs.id] || 'var(--secondary)' 
          };
        });
        setFaultSourcesMap(newMap);
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Bekleyen sorunları olan görevleri filtrele ve sorunları düzleştir
  const pendingIssues = useMemo(() => {
    const issues = [];
    
    for (const task of tasks) {
      for (const issue of (task.issues || [])) {
        if (issue.status === 'pending') {
          issues.push({
            ...issue,
            taskId: task.id,
            customerName: task.customerName,
            location: task.location,
            roleName: task.roleName,
            stageName: task.stageName,
            teamName: task.teamName,
            jobId: task.jobId,
          });
        }
      }
    }
    
    // Filtrele
    let result = [...issues];
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.customerName?.toLowerCase().includes(q) ||
        i.item?.toLowerCase().includes(q) ||
        i.note?.toLowerCase().includes(q)
      );
    }
    
    if (typeFilter) {
      result = result.filter(i => i.type === typeFilter);
    }
    
    // Tarihe göre sırala (en yeni önce)
    result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    
    return result;
  }, [tasks, search, typeFilter]);

  const handleResolve = async (issue) => {
    if (!confirm('Bu sorunu çözüldü olarak işaretlemek istediğinize emin misiniz?')) return;
    
    try {
      setActionLoading(true);
      await resolveAssemblyIssue(issue.taskId, issue.id);
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  const columns = [
    {
      header: 'Müşteri / Konum',
      accessor: 'customerName',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.customerName}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            📍 {row.location || '—'}
          </div>
        </div>
      ),
    },
    {
      header: 'Görev',
      accessor: 'roleName',
      render: (_, row) => (
        <div>
          <div>{row.roleName}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.stageName}</div>
        </div>
      ),
    },
    {
      header: 'Sorun',
      accessor: 'item',
      render: (_, row) => {
        const issueType = issueTypesMap[row.type] || { label: row.type, icon: '❓' };
        return (
          <div>
            <div style={{ fontWeight: 600 }}>
              {issueType.icon} {row.item} ({row.quantity} adet)
            </div>
            <span className="badge" style={{ fontSize: '0.65rem' }}>
              {issueType.label}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Hata Kaynağı',
      accessor: 'faultSource',
      render: (val) => {
        const source = faultSourcesMap[val] || { label: val, color: 'var(--secondary)' };
        return (
          <span 
            className="badge" 
            style={{ background: source.color, color: '#fff' }}
          >
            {source.label}
          </span>
        );
      },
    },
    {
      header: 'Yedek Sipariş',
      accessor: 'replacementOrderId',
      render: (val) => val ? (
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => navigate(`/isler/uretim-takip/siparisler?search=${val}`)}
          style={{ color: 'var(--primary)' }}
        >
          📦 {val}
        </button>
      ) : (
        <span style={{ color: 'var(--text-muted)' }}>—</span>
      ),
    },
    {
      header: 'Tarih',
      accessor: 'createdAt',
      render: (val) => formatDate(val),
    },
    {
      header: 'İşlem',
      accessor: 'actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            className="btn btn-sm btn-success"
            onClick={() => handleResolve(row)}
            disabled={actionLoading}
            title="Çözüldü Olarak İşaretle"
          >
            ✓
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => navigate(`/isler/list?job=${row.jobId}&stage=5`)}
            title="İşe Git"
          >
            →
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Bekleyen Montaj Sorunları" subtitle="Yükleniyor..." />
        <div className="card subtle-card">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bekleyen Montaj Sorunları"
        subtitle={`${pendingIssues.length} bekleyen sorun`}
      />

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ margin: 0, background: 'var(--danger)', color: '#fff' }}>
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Toplam Bekleyen</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{pendingIssues.length}</div>
          </div>
        </div>
        <div className="card" style={{ margin: 0, background: 'var(--warning)', color: '#fff' }}>
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Üretim Hatası</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {pendingIssues.filter(i => i.faultSource === 'production').length}
            </div>
          </div>
        </div>
        <div className="card" style={{ margin: 0, background: 'var(--info)', color: '#fff' }}>
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Ekip Hatası</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {pendingIssues.filter(i => i.faultSource === 'team').length}
            </div>
          </div>
        </div>
        <div className="card" style={{ margin: 0, background: 'var(--primary)', color: '#fff' }}>
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Yedek Sipariş</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {pendingIssues.filter(i => i.replacementOrderId).length}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="form-control"
              placeholder="🔍 Müşteri, ürün ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select
              className="form-control"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ width: '150px' }}
            >
              <option value="">Tüm Türler</option>
              {Object.entries(issueTypesMap).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable 
          columns={columns} 
          data={pendingIssues} 
          emptyMessage="Bekleyen montaj sorunu yok 🎉" 
        />
      </div>
    </div>
  );
};

export default MontajSorunlar;
