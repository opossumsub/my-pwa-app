const CACHE_NAME = 'yoga-studio-v1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Pangolin&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Установка Service Worker и кэширование ресурсов
self.addEventListener('install', function(event) {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Service Worker: Caching app resources');
                return cache.addAll(urlsToCache).catch(function(error) {
                    console.error('Service Worker: Cache addAll error:', error);
                    // Продолжаем работу даже если некоторые ресурсы не закэшировались
                });
            })
            .then(function() {
                console.log('Service Worker: Skip waiting on install');
                return self.skipWaiting();
            })
    );
});

// Обработка fetch-запросов
self.addEventListener('fetch', function(event) {
    // Пропускаем не-GET запросы и запросы из других источников
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // Возвращаем кэшированный ответ если есть
                if (response) {
                    console.log('Service Worker: Serving from cache:', event.request.url);
                    return response;
                }

                // Клонируем запрос для fetch
                var fetchRequest = event.request.clone();

                return fetch(fetchRequest)
                    .then(function(response) {
                        // Проверяем валидность ответа
                        if (!response || response.status !== 200 || response.type === 'opaque') {
                            return response;
                        }

                        // Клонируем ответ для кэширования
                        var responseToCache = response.clone();

                        // Кэшируем успешные ответы
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                cache.put(event.request, responseToCache);
                                console.log('Service Worker: Caching new resource:', event.request.url);
                            })
                            .catch(function(error) {
                                console.error('Service Worker: Cache put error:', error);
                            });

                        return response;
                    })
                    .catch(function(error) {
                        console.error('Service Worker: Fetch failed:', error, event.request.url);
                        
                        // Можно вернуть fallback для определенных типов ресурсов
                        if (event.request.destination === 'image') {
                            // Вернуть fallback изображение
                        } else if (event.request.destination === 'style') {
                            // Вернуть пустой CSS
                        }
                        
                        return new Response('Network error happened', {
                            status: 408,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
            })
    );
});

// Активация Service Worker и очистка старых кэшей
self.addEventListener('activate', function(event) {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        // Удаляем все старые версии кэша
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(function() {
                console.log('Service Worker: Claiming clients');
                return self.clients.claim();
            })
    );
});

// Обработка сообщений от главного потока
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});