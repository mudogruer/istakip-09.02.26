export const NAV_ITEMS = [
  {
    section: 'Kontrol',
    items: [{ icon: 'dashboard', label: 'Kontrol Paneli', path: '/dashboard' }],
  },
  {
    section: 'Operasyon',
    items: [
      {
        icon: 'assignment',
        label: 'İşler',
        path: '/isler',
        collapsible: true,
        children: [
          { label: 'İş Listesi', path: '/isler/list' },
          { label: 'Keşif/Ölçü Takvimi', path: '/isler/takvim' },
          { label: 'Üretim Planı', path: '/isler/uretim-plani' },
          { label: 'Montaj Takvimi', path: '/isler/montaj-takvimi' },
          { 
            label: 'Üretim Takip', 
            path: '/isler/uretim-takip',
            icon: 'factory',
            children: [
              { label: 'Tüm Emirler', path: '/isler/uretim-takip/siparisler' },
              { label: 'İç Üretim', path: '/isler/uretim-takip/ic-uretim' },
              { label: 'Dış Üretim', path: '/isler/uretim-takip/dis-siparis' },
              { label: 'Cam Emirleri', path: '/isler/uretim-takip/cam' },
              { label: 'Sorun Takip', path: '/isler/uretim-takip/sorunlar' },
            ]
          },
          { 
            label: 'Montaj Takip', 
            path: '/isler/montaj-takip',
            icon: 'build',
            children: [
              { label: 'Planlanan Montajlar', path: '/isler/montaj-takip/planlanan' },
              { label: 'Bugünkü Montajlar', path: '/isler/montaj-takip/bugun' },
              { label: 'Bekleyen Sorunlar', path: '/isler/montaj-takip/sorunlar' },
            ]
          },
        ],
      },
      {
        icon: 'task_alt',
        label: 'Görevler',
        path: '/gorevler',
        collapsible: true,
        children: [
          { label: 'Görev Listesi', path: '/gorevler/list' },
          { label: 'Personel', path: '/gorevler/personel' },
          { label: 'Ekipler', path: '/gorevler/ekipler' },
          { label: 'Roller', path: '/gorevler/roller' },
        ],
      },
      { icon: 'groups', label: 'Müşteriler', path: '/musteriler' },
    ],
  },
  {
    section: 'Stok & Satınalma',
    items: [
      {
        icon: 'inventory_2',
        label: 'Stok',
        path: '/stok',
        collapsible: true,
        children: [
          { label: 'Stok Listesi', path: '/stok/liste' },
          { label: 'Stok Hareketleri', path: '/stok/hareketler' },
          { label: 'Kritik Stok', path: '/stok/kritik' },
          { label: 'Rezervasyonlar', path: '/stok/rezervasyonlar' },
          { label: 'Renkler', path: '/stok/renkler' },
        ],
      },
      {
        icon: 'shopping_cart',
        label: 'Satınalma',
        path: '/satinalma',
        collapsible: true,
        children: [
          { label: 'Siparişler (PO)', path: '/satinalma/siparisler' },
          { label: 'Eksik Ürünler', path: '/satinalma/eksik' },
          { label: 'Bekleyen Teslimatlar', path: '/satinalma/bekleyen' },
          { label: 'Tedarikçiler', path: '/satinalma/tedarikciler' },
        ],
      },
    ],
  },
  {
    section: 'Finans & Evrak',
    items: [
      { icon: 'description', label: 'İrsaliye & Fatura', path: '/evrak/irsaliye-fatura' },
      { icon: 'account_balance_wallet', label: 'Ödemeler/Kasa', path: '/finans/odemeler-kasa' },
    ],
  },
  {
    section: 'Dijital Arşiv & Rapor',
    items: [
      { icon: 'archive', label: 'Dijital Arşiv', path: '/arsiv' },
      { icon: 'bar_chart', label: 'Raporlar', path: '/raporlar' },
    ],
  },
  {
    section: 'Sistem',
    items: [
      { icon: 'monitoring', label: 'Aktiviteler', path: '/aktiviteler' },
      { icon: 'settings', label: 'Ayarlar', path: '/ayarlar' },
    ],
  },
];

export const normalizePath = (path) => {
  if (!path) return '/';
  const cleaned = path.replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
};

export const findPageTitle = (pathname) => {
  const normalized = normalizePath(pathname);
  let title = 'İş Takip Paneli';

  NAV_ITEMS.forEach((section) => {
    section.items.forEach((item) => {
      if (normalizePath(item.path) === normalized) {
        title = item.label;
      }
      if (item.children) {
        item.children.forEach((child) => {
          if (normalizePath(child.path) === normalized) {
            title = child.label;
          }
          if (child.children) {
            child.children.forEach((grandchild) => {
              if (normalizePath(grandchild.path) === normalized) {
                title = grandchild.label;
              }
            });
          }
        });
      }
    });
  });

  return title;
};
