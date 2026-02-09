import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Loader from '../components/Loader';
import {
  getJobs,
  updateJobMeasure,
  updateJobStatus,
} from '../services/dataService';

// Durum renkleri
const STATUS_COLORS = {
  'OLCU_RANDEVU_BEKLIYOR': '#9ca3af', // Gri - bekliyor
  'OLCU_RANDEVULU': '#f59e0b',        // Sarı - randevu verildi
  'MUSTERI_OLCUSU_BEKLENIYOR': '#3b82f6', // Mavi - ölçü alındı
  'OLCU_ALINDI': '#10b981',           // Yeşil - tamamlandı
};

const STATUS_LABELS = {
  'OLCU_RANDEVU_BEKLIYOR': 'Randevu Bekliyor',
  'OLCU_RANDEVULU': 'Randevu Verildi',
  'MUSTERI_OLCUSU_BEKLENIYOR': 'Ölçü Bekleniyor',
  'OLCU_ALINDI': 'Ölçü Alındı',
};

// Ölçü/keşif aşamasındaki durumlar
const MEASURE_STATUSES = [
  'OLCU_RANDEVU_BEKLIYOR',
  'OLCU_RANDEVULU', 
  'MUSTERI_OLCUSU_BEKLENIYOR',
  'OLCU_ALINDI',
];

const IslerTakvim = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  
  // View
  const [viewMode, setViewMode] = useState('month'); // month | week
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Drag & Drop
  const [draggedJob, setDraggedJob] = useState(null);
  
  // Modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  
  // Appointment time modal
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [appointmentTime, setAppointmentTime] = useState('10:00');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const jobsData = await getJobs();
      // Sadece ölçü/keşif aşamasındaki işleri filtrele
      const measureJobs = jobsData.filter(j => MEASURE_STATUSES.includes(j.status));
      setJobs(measureJobs);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Takvim günleri
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    if (viewMode === 'month') {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      
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
    } else {
      // Haftalık görünüm
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1;
      startOfWeek.setDate(startOfWeek.getDate() - day);
      
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        days.push({ date: d, isCurrentMonth: true });
      }
      return days;
    }
  }, [currentDate, viewMode]);

  // Randevu tarihi olan işler (takvimde gösterilecek)
  const scheduledJobs = useMemo(() => {
    return jobs.filter(j => j.measure?.appointment?.date);
  }, [jobs]);

  // Randevu bekleyen işler (sol panelde gösterilecek)
  const unscheduledJobs = useMemo(() => {
    return jobs.filter(j => 
      j.status === 'OLCU_RANDEVU_BEKLIYOR' && !j.measure?.appointment?.date
    );
  }, [jobs]);

  // Tarihe göre işleri grupla
  const jobsByDate = useMemo(() => {
    const map = {};
    
    for (const job of scheduledJobs) {
      const appointmentDate = job.measure?.appointment?.date;
      if (!appointmentDate) continue;
      
      // ISO date string'den sadece tarih kısmını al
      const dateKey = appointmentDate.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(job);
    }
    
    // Saate göre sırala
    for (const dateKey in map) {
      map[dateKey].sort((a, b) => {
        const timeA = a.measure?.appointment?.date || '';
        const timeB = b.measure?.appointment?.date || '';
        return timeA.localeCompare(timeB);
      });
    }
    
    return map;
  }, [scheduledJobs]);

  const formatDateKey = (date) => {
    return date.toISOString().slice(0, 10);
  };

  // İşten saat bilgisini al
  const getAppointmentTime = (job) => {
    const dateStr = job.measure?.appointment?.date;
    if (!dateStr || dateStr.length < 16) return null;
    return dateStr.slice(11, 16); // "10:00" formatında
  };

  // Drag handlers - dataTransfer kullanarak job ID'yi sakla (state karışıklığını önler)
  const handleDragStart = (e, job) => {
    setDraggedJob(job);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', job.id); // Job ID'yi dataTransfer'a kaydet
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = () => {
    setDraggedJob(null);
  };

  // Takvime bırakma - önce saat seç
  const handleDropOnCalendar = async (e, date) => {
    e.preventDefault();
    
    // dataTransfer'dan job ID al (daha güvenilir)
    const jobId = e.dataTransfer.getData('text/plain');
    const job = jobs.find(j => j.id === jobId);
    
    if (!job) {
      setDraggedJob(null);
      return;
    }
    
    // Zaten randevusu var mı?
    const hasAppointment = job.measure?.appointment?.date;
    
    if (hasAppointment) {
      // Direkt taşı (saat koru)
      const existingTime = getAppointmentTime(job) || '10:00';
      await scheduleAppointment(job.id, date, existingTime);
    } else {
      // Saat seçimi modal'ı aç
      setPendingDrop({ job, date });
      setAppointmentTime('10:00');
      setShowTimeModal(true);
    }
    
    setDraggedJob(null);
  };

  // Randevu ver
  const scheduleAppointment = async (jobId, date, time) => {
    const dateStr = formatDateKey(date);
    const appointmentDateTime = `${dateStr}T${time}`;
    
    // Optimistic update
    setJobs(prev => prev.map(j => 
      j.id === jobId 
        ? { 
            ...j, 
            status: 'OLCU_RANDEVULU',
            measure: { 
              ...j.measure, 
              appointment: { date: appointmentDateTime } 
            } 
          } 
        : j
    ));
    
    try {
      await updateJobMeasure(jobId, { appointment: { date: appointmentDateTime } });
      // Durum güncelle
      await updateJobStatus(jobId, { status: 'OLCU_RANDEVULU' });
    } catch (err) {
      alert('Randevu kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'));
      loadData(); // Geri al
    }
  };

  // Saat seçim modal onay
  const confirmTimeSelection = async () => {
    if (!pendingDrop) return;
    
    await scheduleAppointment(pendingDrop.job.id, pendingDrop.date, appointmentTime);
    setShowTimeModal(false);
    setPendingDrop(null);
  };

  // Sol panele (planlanmamışa) geri bırakma - randevu iptali
  const handleDropOnUnscheduled = async (e) => {
    e.preventDefault();
    
    // dataTransfer'dan job ID al
    const jobId = e.dataTransfer.getData('text/plain');
    const job = jobs.find(j => j.id === jobId);
    
    // Sadece randevusu olan işler iptal edilebilir
    if (!job || !job.measure?.appointment?.date) {
      setDraggedJob(null);
      return;
    }
    
    // Optimistic update
    setJobs(prev => prev.map(j => 
      j.id === jobId 
        ? { 
            ...j, 
            status: 'OLCU_RANDEVU_BEKLIYOR',
            measure: { ...j.measure, appointment: null } 
          } 
        : j
    ));
    setDraggedJob(null);
    
    try {
      await updateJobMeasure(jobId, { appointment: null });
      await updateJobStatus(jobId, { status: 'OLCU_RANDEVU_BEKLIYOR' });
    } catch (err) {
      alert('Randevu iptal edilemedi: ' + (err.message || 'Bilinmeyen hata'));
      loadData(); // Geri al
    }
  };

  const openJobDetail = (job) => {
    setSelectedJob(job);
    setShowDetailModal(true);
  };

  // Navigation
  const prevPeriod = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const nextPeriod = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  // Format
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
  };

  // İş kollarını string olarak al
  const getRolesString = (job) => {
    if (!job.roles || job.roles.length === 0) return '';
    return job.roles.map(r => r.name).join(', ');
  };

  const today = new Date().toISOString().slice(0, 10);
  const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const weekDaysFull = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  // Saat dilimleri (haftalık görünüm için)
  const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

  if (loading) {
    return <Loader text="Keşif/Ölçü takvimi yükleniyor..." />;
  }

  return (
    <div>
      <PageHeader
        title="Keşif / Ölçü Takvimi"
        subtitle="Ölçü randevularını takvime sürükle-bırak ile planlayın"
      />

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sol Panel - Randevu Bekleyenler */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div 
            className="card" 
            style={{ 
              padding: 20,
              border: draggedJob?.measure?.appointment?.date ? '2px dashed var(--color-primary)' : undefined,
              transition: 'border 0.2s',
              height: viewMode === 'week' ? 'auto' : 'calc(100vh - 280px)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onDragOver={handleDragOver}
            onDrop={handleDropOnUnscheduled}
          >
            <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              📅 Randevu Bekleyenler
              <span className="badge badge-warning" style={{ fontSize: 12 }}>{unscheduledJobs.length}</span>
            </h4>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Takvime sürükleyin veya takvimden buraya geri bırakın (randevu iptal)
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
              {unscheduledJobs.length === 0 ? (
                <div 
                  style={{ 
                    textAlign: 'center', 
                    padding: 40, 
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 12,
                    border: '2px dashed var(--color-border)',
                    color: 'var(--color-text-muted)'
                  }}
                >
                  {draggedJob?.measure?.appointment?.date ? (
                    <span style={{ color: 'var(--color-primary)', fontSize: 14 }}>📥 Buraya bırakın (randevu iptal)</span>
                  ) : (
                    <>✅ Tüm işlere randevu verildi</>
                  )}
                </div>
              ) : (
                unscheduledJobs.map(job => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, job)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openJobDetail(job)}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 10,
                      cursor: 'grab',
                      borderLeft: `5px solid ${STATUS_COLORS[job.status] || '#ccc'}`,
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
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-primary)', marginBottom: 4 }}>
                      👤 {job.customerName || 'Müşteri Yok'}
                    </div>
                    {/* İş Başlığı */}
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                      {job.title || job.id}
                    </div>
                    {/* İş Kolları */}
                    {job.roles && job.roles.length > 0 && (
                      <div style={{ 
                        fontSize: 11, 
                        color: 'var(--color-text-muted)', 
                        fontStyle: 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {getRolesString(job)}
                      </div>
                    )}
                    {/* Durum */}
                    <div style={{ marginTop: 8 }}>
                      <span 
                        className="badge badge-warning" 
                        style={{ fontSize: 10 }}
                      >
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sağ - Takvim */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 20 }}>
            {/* Üst Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <button className="btn btn-secondary" onClick={prevPeriod}>
                ← {viewMode === 'month' ? 'Önceki Ay' : 'Önceki Hafta'}
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>
                  {viewMode === 'month' 
                    ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                    : `${calendarDays[0]?.date.getDate()} - ${calendarDays[6]?.date.getDate()} ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                  }
                </h2>
                <button className="btn btn-sm btn-outline" onClick={goToday} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Bugün
                </button>
                
                {/* Görünüm Toggle */}
                <div style={{ display: 'flex', background: 'var(--color-bg-secondary)', borderRadius: 8, padding: 3 }}>
                  <button
                    onClick={() => setViewMode('month')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      background: viewMode === 'month' ? 'var(--color-primary)' : 'transparent',
                      color: viewMode === 'month' ? '#fff' : 'var(--color-text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    📅 Aylık
                  </button>
                  <button
                    onClick={() => setViewMode('week')}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      background: viewMode === 'week' ? 'var(--color-primary)' : 'transparent',
                      color: viewMode === 'week' ? '#fff' : 'var(--color-text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    📆 Haftalık
                  </button>
                </div>
              </div>
              
              <button className="btn btn-secondary" onClick={nextPeriod}>
                {viewMode === 'month' ? 'Sonraki Ay' : 'Sonraki Hafta'} →
              </button>
            </div>

            {/* Gün Başlıkları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
              {(viewMode === 'week' ? weekDaysFull : weekDays).map(day => (
                <div 
                  key={day} 
                  style={{ 
                    textAlign: 'center', 
                    fontWeight: 700, 
                    fontSize: viewMode === 'week' ? 14 : 13, 
                    padding: viewMode === 'week' ? 12 : 10,
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 8
                  }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Takvim Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {calendarDays.map((dayInfo, idx) => {
                const dateKey = formatDateKey(dayInfo.date);
                const dayJobs = jobsByDate[dateKey] || [];
                const isToday = dateKey === today;
                const isPast = dayInfo.date < new Date(today);
                
                const cellHeight = viewMode === 'week' ? 320 : 160;
                const maxVisible = viewMode === 'week' ? 5 : 2;

                return (
                  <div
                    key={idx}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnCalendar(e, dayInfo.date)}
                    style={{
                      minHeight: cellHeight,
                      padding: viewMode === 'week' ? 12 : 10,
                      background: isToday 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : isPast && dayInfo.isCurrentMonth
                        ? 'rgba(0,0,0,0.02)'
                        : 'var(--color-bg-secondary)',
                      borderRadius: 10,
                      border: isToday ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      opacity: dayInfo.isCurrentMonth ? 1 : 0.4,
                      transition: 'background 0.2s',
                    }}
                    onDragEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.style.background = isToday 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : isPast && dayInfo.isCurrentMonth
                        ? 'rgba(0,0,0,0.02)'
                        : 'var(--color-bg-secondary)';
                    }}
                  >
                    {/* Gün Numarası */}
                    <div style={{ 
                      fontWeight: isToday ? 700 : 600, 
                      fontSize: viewMode === 'week' ? 18 : 14, 
                      marginBottom: 8,
                      color: isToday ? 'var(--color-primary)' : 'inherit',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{dayInfo.date.getDate()}</span>
                      {dayJobs.length > 0 && (
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
                          {dayJobs.length}
                        </span>
                      )}
                    </div>
                    
                    {/* İş Bar'ları */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {dayJobs.slice(0, maxVisible).map(job => {
                        const statusColor = STATUS_COLORS[job.status] || '#3b82f6';
                        const appointmentTime = getAppointmentTime(job);
                        const isCompleted = job.status === 'OLCU_ALINDI';
                        
                        return (
                          <div
                            key={job.id}
                            draggable={!isCompleted}
                            onDragStart={(e) => handleDragStart(e, job)}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => {
                              e.stopPropagation();
                              openJobDetail(job);
                            }}
                            style={{
                              padding: viewMode === 'week' ? '10px 12px' : '8px 10px',
                              background: statusColor,
                              color: 'white',
                              borderRadius: 8,
                              cursor: isCompleted ? 'default' : 'grab',
                              transition: 'transform 0.1s, box-shadow 0.1s',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                              opacity: isCompleted ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isCompleted) {
                                e.currentTarget.style.transform = 'scale(1.03)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.25)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
                            }}
                            title={`${job.customerName} - ${job.title}\n${getRolesString(job)}\nDurum: ${STATUS_LABELS[job.status] || job.status}`}
                          >
                            {/* Saat (haftalık görünümde) */}
                            {viewMode === 'week' && appointmentTime && (
                              <div style={{ 
                                fontSize: 11, 
                                opacity: 0.9, 
                                marginBottom: 4,
                                background: 'rgba(255,255,255,0.2)',
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: 4
                              }}>
                                🕐 {appointmentTime}
                              </div>
                            )}
                            
                            {/* Müşteri Adı */}
                            <div style={{ 
                              fontWeight: 700, 
                              fontSize: viewMode === 'week' ? 14 : 13,
                              marginBottom: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {job.customerName || 'Müşteri'}
                            </div>
                            
                            {/* İş Başlığı */}
                            <div style={{ 
                              fontSize: viewMode === 'week' ? 12 : 11,
                              opacity: 0.9,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginBottom: 2
                            }}>
                              {job.title || job.id}
                            </div>
                            
                            {/* İş Kolları (sadece haftalık görünümde) */}
                            {viewMode === 'week' && job.roles && job.roles.length > 0 && (
                              <div style={{ 
                                fontSize: 10,
                                opacity: 0.75,
                                fontStyle: 'italic',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {getRolesString(job)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {dayJobs.length > maxVisible && (
                        <div 
                          style={{ 
                            fontSize: 11, 
                            color: 'var(--color-primary)', 
                            textAlign: 'center',
                            padding: 6,
                            background: 'rgba(59, 130, 246, 0.1)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                          onClick={() => openJobDetail(dayJobs[maxVisible])}
                        >
                          +{dayJobs.length - maxVisible} daha
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginRight: 8 }}>DURUM:</span>
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: color }} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Saat Seçim Modal */}
      <Modal
        isOpen={showTimeModal}
        onClose={() => { setShowTimeModal(false); setPendingDrop(null); }}
        title="Randevu Saati Seçin"
        size="sm"
      >
        <div style={{ padding: 16 }}>
          {pendingDrop && (
            <>
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontWeight: 600 }}>{pendingDrop.job.customerName}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{pendingDrop.job.title}</div>
                <div style={{ fontSize: 12, color: 'var(--color-primary)', marginTop: 4 }}>
                  📅 {pendingDrop.date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Randevu Saati</label>
                <select
                  className="form-input"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                >
                  {timeSlots.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => { setShowTimeModal(false); setPendingDrop(null); }}
                  style={{ flex: 1 }}
                >
                  İptal
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={confirmTimeSelection}
                  style={{ flex: 1 }}
                >
                  ✓ Randevu Ver
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* İş Detay Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="İş Detayı"
        size="md"
      >
        {selectedJob && (
          <div style={{ padding: 8 }}>
            {/* Başlık */}
            <div style={{ 
              background: `linear-gradient(135deg, ${STATUS_COLORS[selectedJob.status] || '#3b82f6'} 0%, ${STATUS_COLORS[selectedJob.status] || '#3b82f6'}dd 100%)`, 
              padding: 20, 
              borderRadius: 12, 
              marginBottom: 20,
              color: '#fff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>
                    👤 {selectedJob.customerName || 'Müşteri Yok'}
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>
                    {selectedJob.title || selectedJob.id}
                  </div>
                  {selectedJob.roles && selectedJob.roles.length > 0 && (
                    <div style={{ 
                      display: 'inline-block',
                      background: 'rgba(255,255,255,0.2)', 
                      padding: '4px 12px', 
                      borderRadius: 16, 
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {getRolesString(selectedJob)}
                    </div>
                  )}
                </div>
                <span 
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {STATUS_LABELS[selectedJob.status] || selectedJob.status}
                </span>
              </div>
            </div>

            {/* Detaylar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 14, borderRadius: 10 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Randevu Tarihi</div>
                <div style={{ fontWeight: 600, color: selectedJob.measure?.appointment?.date ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {selectedJob.measure?.appointment?.date 
                    ? formatDateTime(selectedJob.measure.appointment.date) 
                    : 'Randevu Verilmedi'}
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 14, borderRadius: 10 }}>
                <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Oluşturulma</div>
                <div style={{ fontWeight: 600 }}>
                  {formatDate(selectedJob.createdAt)}
                </div>
              </div>
            </div>

            {/* İş Kolları */}
            {selectedJob.roles && selectedJob.roles.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>📋 İş Kolları</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedJob.roles.map(role => (
                    <span 
                      key={role.id}
                      style={{
                        background: 'var(--color-bg-secondary)',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 500
                      }}
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Aksiyonlar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)} style={{ padding: '10px 20px' }}>
                Kapat
              </button>
              <button 
                className="btn btn-primary"
                style={{ padding: '10px 20px' }}
                onClick={() => {
                  setShowDetailModal(false);
                  navigate(`/isler/list?job=${selectedJob.id}&stage=0`);
                }}
              >
                İşe Git →
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default IslerTakvim;
