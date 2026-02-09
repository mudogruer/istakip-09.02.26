import { useEffect, useState, useMemo } from 'react';
import PageHeader from '../components/PageHeader';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import DelayReasonModal from '../components/DelayReasonModal';
import { getProductionOrders, getJobs, updateProductionPlan, getJobRolesConfig, updateProductionDates } from '../services/dataService';

const STATUS_COLORS = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  completed: '#10b981',
  cancelled: '#6b7280',
};

const STATUS_LABELS = {
  pending: 'Bekliyor',
  in_progress: 'Üretimde',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

const IslerUretimPlani = () => {
  const [orders, setOrders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [roleConfigs, setRoleConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'weekly'
  const [draggedOrder, setDraggedOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Gecikme modal state
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [pendingReschedule, setPendingReschedule] = useState(null); // { orderId, oldDate, newDate, delayDays }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [ordersData, jobsData, rolesData] = await Promise.all([
        getProductionOrders().catch(() => []),
        getJobs().catch(() => []),
        getJobRolesConfig(true).catch(() => []),
      ]);
      // İç üretim siparişlerini filtrele ve iş bilgilerini ekle
      const enrichedOrders = ordersData
        .filter(o => o.orderType === 'internal' && o.status !== 'cancelled')
        .map(order => {
          const job = jobsData.find(j => j.id === order.jobId);
          // İş kolunun kısa adını bul
          const roleConfig = rolesData.find(r => r.id === order.roleId);
          const roleShort = roleConfig?.name?.substring(0, 3).toUpperCase() || '';
          return {
            ...order,
            // Önce order'daki customerName'i kullan, yoksa job'dan al
            customerName: order.customerName || job?.customerName || '',
            jobTitle: job?.title || order.jobTitle || '',
            roleName: roleConfig?.name || order.roleName || '',
            roleShort,
          };
        });
      setOrders(enrichedOrders);
      setJobs(jobsData);
      setRoleConfigs(rolesData);
    } catch (err) {
      setError(err.message || 'Veriler alınamadı');
    } finally {
      setLoading(false);
    }
  };

  // İşin montaj tarihini bul
  const getJobAssemblyDate = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    return job?.estimatedAssembly?.date || null;
  };

  // Aylık takvim günleri
  const monthlyDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    
    const days = [];
    
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false });
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    
    return days;
  }, [currentDate]);

  // Haftalık takvim günleri
  const weeklyDays = useMemo(() => {
    const date = new Date(currentDate);
    const dayOfWeek = date.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({ date: d, isCurrentMonth: true });
    }
    return days;
  }, [currentDate]);

  const calendarDays = viewMode === 'monthly' ? monthlyDays : weeklyDays;

  // Günde planlanmış emirleri bul
  const getOrdersForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return orders.filter(o => o.plannedDate === dateStr);
  };

  // Planlanmamış emirler
  const unplannedOrders = useMemo(() => {
    return orders.filter(o => !o.plannedDate && o.status !== 'completed');
  }, [orders]);

  // Drag & Drop handlers
  // Drag handlers - dataTransfer kullanarak order ID'yi sakla (state karışıklığını önler)
  const handleDragStart = (e, order) => {
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', order.id); // Order ID'yi dataTransfer'a kaydet
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Takvime bırakma
  const handleDropOnCalendar = (e, date) => {
    e.preventDefault();
    
    // dataTransfer'dan order ID al (daha güvenilir)
    const orderId = e.dataTransfer.getData('text/plain');
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
      setDraggedOrder(null);
      return;
    }

    // Montaj tarihi kontrolü
    const assemblyDate = getJobAssemblyDate(order.jobId);
    if (assemblyDate) {
      const assembly = new Date(assemblyDate);
      if (date > assembly) {
        alert('⚠️ Üretim tarihi montaj tarihinden sonra olamaz!');
        setDraggedOrder(null);
        return;
      }
    }

    const dateStr = date.toISOString().split('T')[0];
    
    // Tarih ileri mi alınıyor? (erteleme kontrolü)
    if (order.plannedDate) {
      const oldDate = new Date(order.plannedDate);
      const newDate = new Date(dateStr);
      if (newDate > oldDate) {
        const delayDays = Math.ceil((newDate - oldDate) / (1000 * 60 * 60 * 24));
        setPendingReschedule({
          orderId,
          oldDate: order.plannedDate,
          newDate: dateStr,
          delayDays
        });
        setShowDelayModal(true);
        setDraggedOrder(null);
        return;
      }
    }
    
    // Normal planlama (erteleme değil)
    setOrders(prev => prev.map(o => 
      o.id === orderId ? { ...o, plannedDate: dateStr } : o
    ));
    setDraggedOrder(null);
    
    updateProductionPlan(orderId, { plannedDate: dateStr })
      .catch(err => {
        console.error('Plan kaydedilemedi:', err);
        loadData();
        alert('Plan kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'));
      });
  };

  // Planlanmamış emirlere geri bırakma
  const handleDropOnUnplanned = (e) => {
    e.preventDefault();
    
    // dataTransfer'dan order ID al
    const orderId = e.dataTransfer.getData('text/plain');
    const order = orders.find(o => o.id === orderId);
    
    // Sadece planlanmış emirler geri bırakılabilir
    if (!order || !order.plannedDate) {
      setDraggedOrder(null);
      return;
    }
    
    setOrders(prev => prev.map(o => 
      o.id === orderId ? { ...o, plannedDate: null } : o
    ));
    setDraggedOrder(null);
    
    updateProductionPlan(orderId, { plannedDate: null })
      .catch(err => {
        console.error('Plan kaldırılamadı:', err);
        loadData();
        alert('Plan kaldırılamadı: ' + (err.message || 'Bilinmeyen hata'));
      });
  };

  const handleDragEnd = () => {
    setDraggedOrder(null);
  };

  // Gecikme modal işlemleri
  const handleDelayConfirm = async ({ reason, responsiblePersonId, note }) => {
    if (!pendingReschedule) return;
    
    const { orderId, newDate } = pendingReschedule;
    
    try {
      // Önce tarihi güncelle
      await updateProductionPlan(orderId, { plannedDate: newDate });
      
      // Sonra gecikme kaydını ekle
      await updateProductionDates(orderId, {
        delayReason: reason,
        delayNote: note,
        responsiblePersonId
      });
      
      // State'i güncelle
      setOrders(prev => prev.map(o => 
        o.id === orderId ? { ...o, plannedDate: newDate } : o
      ));
    } catch (err) {
      console.error('Erteleme kaydedilemedi:', err);
      alert('Erteleme kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setShowDelayModal(false);
      setPendingReschedule(null);
    }
  };

  const handleDelayCancel = () => {
    setShowDelayModal(false);
    setPendingReschedule(null);
  };

  // Navigasyon
  const navigate = (direction) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'monthly') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else {
      newDate.setDate(newDate.getDate() + (direction * 7));
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Emir detayını göster
  const openOrderDetail = (order) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const dayNamesFull = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

  // Tarih formatla
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR');
  };

  // Hafta başlığı
  const getWeekTitle = () => {
    if (weeklyDays.length === 0) return '';
    const first = weeklyDays[0].date;
    const last = weeklyDays[6].date;
    return `${first.getDate()} ${monthNames[first.getMonth()]} - ${last.getDate()} ${monthNames[last.getMonth()]} ${last.getFullYear()}`;
  };

  if (loading) {
    return <Loader text="Üretim planı yükleniyor..." />;
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Üretim Planı" subtitle="Takvim bazlı üretim planlaması" />
        <div className="card error-card">
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader 
        title="Üretim Planı" 
        subtitle="İç üretim emirlerini takvime sürükle-bırak ile planlayın"
      />

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sol: Planlanmamış Emirler */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div 
            className="card" 
            style={{ 
              padding: 20,
              border: draggedOrder?.plannedDate ? '2px dashed var(--color-primary)' : undefined,
              transition: 'border 0.2s',
              height: viewMode === 'weekly' ? 'auto' : 'calc(100vh - 220px)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onDragOver={handleDragOver}
            onDrop={handleDropOnUnplanned}
          >
            <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              📋 Planlanmamış Emirler
              <span className="badge badge-warning" style={{ fontSize: 12 }}>{unplannedOrders.length}</span>
            </h4>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Takvime sürükleyin veya takvimden buraya geri bırakın
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
              {unplannedOrders.length === 0 ? (
                <div 
                  className="text-muted" 
                  style={{ 
                    textAlign: 'center', 
                    padding: 40, 
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 12,
                    border: '2px dashed var(--color-border)'
                  }}
                >
                  {draggedOrder?.plannedDate ? (
                    <span style={{ color: 'var(--color-primary)', fontSize: 14 }}>📥 Buraya bırakın</span>
                  ) : (
                    <>✅ Tüm emirler planlandı</>
                  )}
                </div>
              ) : (
                unplannedOrders.map(order => {
                  const assemblyDate = getJobAssemblyDate(order.jobId);
                  return (
                    <div
                      key={order.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, order)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openOrderDetail(order)}
                      style={{
                        padding: '14px 16px',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 10,
                        cursor: 'grab',
                        borderLeft: `5px solid ${STATUS_COLORS[order.status] || '#ccc'}`,
                        transition: 'transform 0.1s, box-shadow 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      title="Detay için tıklayın, takvime sürükleyip bırakın"
                    >
                      {/* Müşteri Adı */}
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-primary)', marginBottom: 6 }}>
                        👤 {order.customerName || 'Müşteri Yok'}
                      </div>
                      {/* İş Kolu */}
                      <div style={{ 
                        display: 'inline-block',
                        background: 'var(--color-primary)', 
                        color: '#fff', 
                        padding: '3px 10px', 
                        borderRadius: 12, 
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 6
                      }}>
                        {order.roleName || 'İş Kolu'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                        {order.id}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className={`badge badge-${order.status === 'pending' ? 'warning' : 'primary'}`} style={{ fontSize: 10 }}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                        {order.items?.length > 0 && (
                          <span className="badge badge-secondary" style={{ fontSize: 10 }}>
                            {order.items.length} kalem
                          </span>
                        )}
                      </div>
                      {assemblyDate && (
                        <div style={{ fontSize: 11, color: 'var(--color-info)', marginTop: 6 }}>
                          📅 Montaj: {formatDate(assemblyDate)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sağ: Takvim */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 20 }}>
            {/* Takvim Başlık */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button className="btn btn-secondary" onClick={() => navigate(-1)} title={viewMode === 'monthly' ? 'Önceki Ay' : 'Önceki Hafta'}>
                ← {viewMode === 'monthly' ? 'Önceki Ay' : 'Önceki Hafta'}
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>
                  {viewMode === 'monthly' 
                    ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                    : getWeekTitle()
                  }
                </h2>
                <button 
                  className="btn btn-sm btn-outline" 
                  onClick={goToToday}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  Bugün
                </button>
                
                {/* Görünüm Toggle */}
                <div style={{ 
                  display: 'flex', 
                  background: 'var(--color-bg-secondary)', 
                  borderRadius: 8, 
                  padding: 3 
                }}>
                  <button
                    onClick={() => setViewMode('monthly')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      background: viewMode === 'monthly' ? 'var(--color-primary)' : 'transparent',
                      color: viewMode === 'monthly' ? '#fff' : 'var(--color-text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    📅 Aylık
                  </button>
                  <button
                    onClick={() => setViewMode('weekly')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      background: viewMode === 'weekly' ? 'var(--color-primary)' : 'transparent',
                      color: viewMode === 'weekly' ? '#fff' : 'var(--color-text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    📆 Haftalık
                  </button>
                </div>
              </div>
              
              <button className="btn btn-secondary" onClick={() => navigate(1)} title={viewMode === 'monthly' ? 'Sonraki Ay' : 'Sonraki Hafta'}>
                {viewMode === 'monthly' ? 'Sonraki Ay' : 'Sonraki Hafta'} →
              </button>
            </div>

            {/* Gün başlıkları */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: 8, 
              marginBottom: 8 
            }}>
              {(viewMode === 'weekly' ? dayNamesFull : dayNames).map((day, idx) => (
                <div 
                  key={day} 
                  style={{ 
                    textAlign: 'center', 
                    fontWeight: 700, 
                    fontSize: viewMode === 'weekly' ? 14 : 13, 
                    padding: viewMode === 'weekly' ? 12 : 10,
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 8
                  }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Takvim Günleri */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: 8 
            }}>
              {calendarDays.map((dayInfo, idx) => {
                const { date, isCurrentMonth } = dayInfo;
                const isToday = date.toDateString() === today.toDateString();
                const dayOrders = getOrdersForDate(date);
                const isPast = date < today;
                
                // Haftalık görünümde daha yüksek hücreler
                const cellHeight = viewMode === 'weekly' ? 320 : 160;
                const maxVisibleOrders = viewMode === 'weekly' ? 6 : 2;

                return (
                  <div
                    key={idx}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnCalendar(e, date)}
                    style={{
                      minHeight: cellHeight,
                      padding: viewMode === 'weekly' ? 12 : 10,
                      background: isToday 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : isPast && isCurrentMonth
                        ? 'rgba(0,0,0,0.02)'
                        : 'var(--color-bg-secondary)',
                      borderRadius: 10,
                      border: isToday ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      opacity: isCurrentMonth ? 1 : 0.4,
                      transition: 'background 0.2s, transform 0.1s',
                    }}
                    onDragEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.background = isToday 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : isPast && isCurrentMonth
                        ? 'rgba(0,0,0,0.02)'
                        : 'var(--color-bg-secondary)';
                    }}
                  >
                    {/* Gün numarası */}
                    <div style={{ 
                      fontWeight: isToday ? 700 : 600, 
                      fontSize: viewMode === 'weekly' ? 18 : 14, 
                      marginBottom: 8,
                      color: isToday ? 'var(--color-primary)' : 'inherit',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{date.getDate()}</span>
                      {dayOrders.length > 0 && (
                        <span style={{ 
                          background: 'var(--color-primary)', 
                          color: '#fff', 
                          borderRadius: '50%', 
                          width: 22, 
                          height: 22, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          {dayOrders.length}
                        </span>
                      )}
                    </div>
                    
                    {/* Emirler */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {dayOrders.slice(0, maxVisibleOrders).map(order => (
                        <div
                          key={order.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, order)}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => {
                            e.stopPropagation();
                            openOrderDetail(order);
                          }}
                          style={{
                            padding: viewMode === 'weekly' ? '10px 12px' : '8px 10px',
                            background: STATUS_COLORS[order.status] || '#ccc',
                            color: 'white',
                            borderRadius: 8,
                            fontSize: viewMode === 'weekly' ? 14 : 13,
                            fontWeight: 600,
                            cursor: 'grab',
                            transition: 'transform 0.1s, box-shadow 0.1s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.03)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.25)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
                          }}
                          title={`${order.customerName || 'Müşteri Yok'} - ${order.roleName || 'İş Kolu'}\nDetay için tıklayın`}
                        >
                          {/* Müşteri Adı */}
                          <div style={{ 
                            fontWeight: 700, 
                            fontSize: viewMode === 'weekly' ? 14 : 13,
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {order.customerName || 'Müşteri'}
                          </div>
                          {/* İş Kolu */}
                          <div style={{ 
                            display: 'inline-block',
                            background: 'rgba(255,255,255,0.25)', 
                            padding: '3px 8px', 
                            borderRadius: 6,
                            fontSize: viewMode === 'weekly' ? 12 : 11,
                            fontWeight: 600
                          }}>
                            {order.roleName || order.roleShort || 'İş Kolu'}
                          </div>
                        </div>
                      ))}
                      {dayOrders.length > maxVisibleOrders && (
                        <div 
                          style={{ 
                            fontSize: 11, 
                            color: 'var(--color-primary)', 
                            textAlign: 'center',
                            padding: 4,
                            background: 'rgba(59, 130, 246, 0.1)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                          onClick={() => {
                            // İlk gizli emiri aç
                            openOrderDetail(dayOrders[maxVisibleOrders]);
                          }}
                        >
                          +{dayOrders.length - maxVisibleOrders} daha
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Açıklama */}
          <div style={{ display: 'flex', gap: 20, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.entries(STATUS_COLORS).map(([key, color]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: color }} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{STATUS_LABELS[key]}</span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 24 }}>
              💡 Tıklayarak detay görün, sürükleyerek taşıyın
            </div>
          </div>
        </div>
      </div>

      {/* Emir Detay Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Emir Detayı"
        size="md"
      >
        {selectedOrder && (
          <div style={{ padding: 8 }}>
            {/* Müşteri ve İş Bilgisi */}
            <div style={{ 
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)', 
              padding: 20, 
              borderRadius: 12, 
              marginBottom: 20,
              color: '#fff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
                    👤 {selectedOrder.customerName || 'Müşteri Bilgisi Yok'}
                  </div>
                  <div style={{ 
                    display: 'inline-block',
                    background: 'rgba(255,255,255,0.2)', 
                    padding: '4px 12px', 
                    borderRadius: 16, 
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 8
                  }}>
                    {selectedOrder.roleName || 'İş Kolu'}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                    İş No: {selectedOrder.jobId}
                  </div>
                </div>
                <span 
                  style={{
                    background: STATUS_COLORS[selectedOrder.status] || '#ccc',
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                </span>
              </div>
            </div>

            {/* Emir Bilgileri */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 10 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>Emir No</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedOrder.id}</div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 10 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>Oluşturulma</div>
                <div style={{ fontWeight: 600 }}>{formatDate(selectedOrder.createdAt)}</div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 10 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>Planlanan Tarih</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: selectedOrder.plannedDate ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {selectedOrder.plannedDate ? formatDate(selectedOrder.plannedDate) : 'Planlanmadı'}
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 16, borderRadius: 10 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 6 }}>Montaj Tarihi</div>
                <div style={{ fontWeight: 600, color: 'var(--color-info)' }}>
                  {formatDate(getJobAssemblyDate(selectedOrder.jobId))}
                </div>
              </div>
            </div>

            {/* Kalemler */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>📦 Üretim Kalemleri</div>
                <table className="data-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th style={{ textAlign: 'right' }}>Miktar</th>
                      <th style={{ textAlign: 'right' }}>Birim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 500 }}>{item.name || item.productId || '-'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{item.unit || 'adet'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Notlar */}
            {selectedOrder.notes && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>📝 Notlar</div>
                <div style={{ 
                  background: 'var(--color-bg-secondary)', 
                  padding: 16, 
                  borderRadius: 10,
                  fontSize: 14,
                  lineHeight: 1.6
                }}>
                  {selectedOrder.notes}
                </div>
              </div>
            )}

            {/* Aksiyon */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDetailModal(false)}
                style={{ padding: '10px 20px' }}
              >
                Kapat
              </button>
              <button 
                className="btn btn-primary"
                style={{ padding: '10px 20px' }}
                onClick={() => {
                  window.location.href = `/isler/list?job=${selectedOrder.jobId}&stage=4`;
                }}
              >
                İşe Git →
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Gecikme Nedeni Modal */}
      <DelayReasonModal
        isOpen={showDelayModal}
        onClose={handleDelayCancel}
        onConfirm={handleDelayConfirm}
        originalDate={pendingReschedule?.oldDate}
        newDate={pendingReschedule?.newDate}
        delayDays={pendingReschedule?.delayDays || 0}
        title="Üretim Erteleme - Gecikme Nedeni Gerekli"
      />
    </div>
  );
};

export default IslerUretimPlani;
