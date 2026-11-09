const CACHE_NAME = 'siraj-mushaf-v11';

const STATIC_ASSETS = [
  './',
  './سراج_المدينة.html',
  './records_io.js',
  './app.js',
  './styles.css',
  './quran-data.js',
  './data/khdry_final.json',
  './fonts/QCF4_QBSML.woff2',
  './fonts/QCF4_Hafs_01_W.woff2',
  './fonts/QCF4_Hafs_02_W.woff2',
  './fonts/QCF4_Hafs_03_W.woff2',
  './fonts/QCF4_Hafs_04_W.woff2',
  './fonts/QCF4_Hafs_05_W.woff2',
  './fonts/QCF4_Hafs_06_W.woff2',
  './fonts/QCF4_Hafs_07_W.woff2',
  './fonts/QCF4_Hafs_08_W.woff2',
  './fonts/QCF4_Hafs_09_W.woff2',
  './fonts/QCF4_Hafs_10_W.woff2',
  './fonts/QCF4_Hafs_11_W.woff2',
  './fonts/QCF4_Hafs_12_W.woff2',
  './fonts/QCF4_Hafs_13_W.woff2',
  './fonts/QCF4_Hafs_14_W.woff2',
  './fonts/QCF4_Hafs_15_W.woff2',
  './fonts/QCF4_Hafs_16_W.woff2',
  './fonts/QCF4_Hafs_17_W.woff2',
  './fonts/QCF4_Hafs_18_W.woff2',
  './fonts/QCF4_Hafs_19_W.woff2',
  './fonts/QCF4_Hafs_20_W.woff2',
  './fonts/QCF4_Hafs_21_W.woff2',
  './fonts/QCF4_Hafs_22_W.woff2',
  './fonts/QCF4_Hafs_23_W.woff2',
  './fonts/QCF4_Hafs_24_W.woff2',
  './fonts/QCF4_Hafs_25_W.woff2',
  './fonts/QCF4_Hafs_26_W.woff2',
  './fonts/QCF4_Hafs_27_W.woff2',
  './fonts/QCF4_Hafs_28_W.woff2',
  './fonts/QCF4_Hafs_29_W.woff2',
  './fonts/QCF4_Hafs_30_W.woff2',
  './fonts/QCF4_Hafs_31_W.woff2',
  './fonts/QCF4_Hafs_32_W.woff2',
  './fonts/QCF4_Hafs_33_W.woff2',
  './fonts/QCF4_Hafs_34_W.woff2',
  './fonts/QCF4_Hafs_35_W.woff2',
  './fonts/QCF4_Hafs_36_W.woff2',
  './fonts/QCF4_Hafs_37_W.woff2',
  './fonts/QCF4_Hafs_38_W.woff2',
  './fonts/QCF4_Hafs_39_W.woff2',
  './fonts/QCF4_Hafs_40_W.woff2',
  './fonts/QCF4_Hafs_41_W.woff2',
  './fonts/QCF4_Hafs_42_W.woff2',
  './fonts/QCF4_Hafs_43_W.woff2',
  './fonts/QCF4_Hafs_44_W.woff2',
  './fonts/QCF4_Hafs_45_W.woff2',
  './fonts/QCF4_Hafs_46_W.woff2',
  './fonts/QCF4_Hafs_47_W.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
