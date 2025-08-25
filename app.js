class YogaStudioApp {
    constructor() {
        this.dbName = 'YogaStudioDB';
        this.dbVersion = 1;
        this.db = null;
        this.currentWeek = this.getCurrentWeek();
        this.currentTheme = 'light';
        this.init();
    }

    async init() {
        await this.initDB();
        await this.initServiceWorker();
        this.setupEventListeners();
        this.setupTheme();
        this.loadData();
        this.updateUI();
    }

    isValidPhone(phone) {
        if (!phone) return true; // Разрешаем пустое значение
        // Проверяем формат +7 900 123-45-67
        const phoneRegex = /^\+7\s\d{3}\s\d{3}-\d{2}-\d{2}$/;
        return phoneRegex.test(phone);
    }

    setupTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        this.currentTheme = (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) 
            ? savedTheme 
            : (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.updateThemeIcon();
    }

    updateThemeIcon() {
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            icon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    sortSessionsByTime(sessions) {
        return [...sessions].sort((a, b) => {  // Создаем копию массива
            const timeA = a.time.split(':').map(Number);
            const timeB = b.time.split(':').map(Number);
            return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);;
        });
   }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.updateThemeIcon();
        localStorage.setItem('theme', this.currentTheme);
    }

    setLoading(element, isLoading) {
        if (isLoading) {
            element.classList.add('loading');
            element.disabled = true;
        } else {
            element.classList.remove('loading');
            element.disabled = false;
        }
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('clients')) {
                    const store = db.createObjectStore('clients', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('phone', 'phone', { unique: true });
                    store.createIndex('name', 'name', { unique: false });
                }

                if (!db.objectStoreNames.contains('classTypes')) {
                    const store = db.createObjectStore('classTypes', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('name', 'name', { unique: true });
                }

                if (!db.objectStoreNames.contains('sessions')) {
                    const store = db.createObjectStore('sessions', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('classType', 'classType', { unique: false });
                }

                if (!db.objectStoreNames.contains('bookings')) {
                    const store = db.createObjectStore('bookings', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('sessionId', 'sessionId', { unique: false });
                    store.createIndex('clientId', 'clientId', { unique: false });
                }
            };
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async initServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker зарегистрирован');
            } catch (error) {
                console.log('Ошибка регистрации Service Worker:', error);
            }
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        document.getElementById('prevWeek').addEventListener('click', () => {
            this.currentWeek.setDate(this.currentWeek.getDate() - 7);
            this.updateSchedule();
        });

        document.getElementById('nextWeek').addEventListener('click', () => {
            this.currentWeek.setDate(this.currentWeek.getDate() + 7);
            this.updateSchedule();
        });

        document.getElementById('addSessionBtn').addEventListener('click', () => this.showAddSessionModal());
        document.getElementById('addClientBtn').addEventListener('click', () => this.showAddClientModal());
        document.getElementById('addClassBtn').addEventListener('click', () => this.showAddClassModal());

        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('clientSearch').addEventListener('input', (e) => {
            this.searchClients(e.target.value);
        });

        document.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modalOverlay')) {
                this.hideModal();
            }
        });

        document.getElementById('syncBtn').addEventListener('click', () => this.syncData());

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.currentTheme = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', this.currentTheme);
                this.updateThemeIcon();
            }
        });
    }

    updateUI() {
        this.switchTab('schedule');
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.getElementById(tabName).classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        if (tabName === 'schedule') {
            this.updateSchedule();
        } else if (tabName === 'clients') {
            this.loadClients();
        } else if (tabName === 'classes') {
            this.loadClassTypes();
        } else if (tabName === 'stats') {
            this.updateStats();
        }
    }

    async loadData() {
        await this.loadClassTypes();
        await this.loadClients();
        this.updateSchedule();
        this.updateStats();
    }


async loadClassTypes() {
    try {
        const classTypes = await this.getAllClassTypes();
        const container = document.getElementById('classesList');
        
        if (classTypes.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-calendar-plus" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                    <p>Нет типов занятий</p>
                    <p style="color: var(--text-muted);">Добавьте первый тип занятия чтобы начать работу</p>
                </div>
            `;
            return;
        }

        container.innerHTML = classTypes.map(cls => `
            <div class="class-type-card">
                <h4>${this.escapeHtml(cls.name)}</h4>
                <p><i class="fas fa-clock"></i> Продолжительность: ${cls.duration} мин</p>
                <p><i class="fas fa-users"></i> Макс. участников: ${cls.maxParticipants}</p>
                ${cls.description ? `<p><i class="fas fa-info-circle"></i> ${this.escapeHtml(cls.description)}</p>` : ''}
                <div class="form-actions">
                    <button onclick="app.editClassType(${cls.id})" class="btn btn-secondary">
                        <i class="fas fa-edit"></i> Редактировать
                    </button>
                    <button onclick="app.deleteClassType(${cls.id})" class="btn btn-danger">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Ошибка при загрузке типов занятий:', error);
        const container = document.getElementById('classesList');
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle" style="color: var(--danger-color); font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Ошибка при загрузке типов занятий</p>
                <button onclick="app.loadClassTypes()" class="btn btn-primary">
                    <i class="fas fa-refresh"></i> Попробовать снова
                </button>
            </div>
        `;
    }
}

    async loadClients(searchTerm = '') {
        const clients = await this.getAllClients();
        const filteredClients = searchTerm ? 
            clients.filter(client => 
                client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                client.phone.includes(searchTerm)
            ) : clients;

        const container = document.getElementById('clientsList');
        
        if (filteredClients.length === 0) {
            container.innerHTML = '<p>Клиенты не найдены.</p>';
            return;
        }

        container.innerHTML = filteredClients.map(client => `
            <div class="client-card">
                <div class="client-info">
                    <h4>${client.name}</h4>
                    <p>Телефон: ${client.phone}</p>
                    <p>Email: ${client.email || 'Не указан'}</p>
                    ${client.notes ? `<p>Примечания: ${client.notes}</p>` : ''}
                </div>
                <div class="client-actions">
                    <button onclick="app.editClient(${client.id})" class="btn btn-secondary">Редактировать</button>
                    <button onclick="app.viewClientBookings(${client.id})" class="btn btn-primary">Записи</button>
                </div>
            </div>
        `).join('');
    }

    async updateSchedule() {
        const startDate = new Date(this.currentWeek);
        startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
        
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        document.getElementById('currentWeek').textContent = 
            `Неделя ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;

        const sessions = await this.getSessionsForWeek(startDate, endDate);
        this.renderScheduleGrid(startDate, sessions);
    }

    // Добавьте новый метод для расчета времени окончания:
  calculateEndTime(startTime, duration) {
    if (!startTime || !duration) return '--:--';
    
    try {
        const [hours, minutes] = startTime.split(':').map(Number);
        
        // Проверяем валидность времени
        if (isNaN(hours) || isNaN(minutes) || isNaN(duration)) {
            return '--:--';
        }
        
        // Создаем дату с правильным временем
        const totalMinutes = hours * 60 + minutes + duration;
        
        // Вычисляем часы и минуты
        const endHours = Math.floor(totalMinutes / 60) % 24;
        const endMinutes = totalMinutes % 60;
        
        // Форматируем в формат HH:MM
        return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    } catch (error) {
        console.error('Ошибка расчета времени окончания:', error);
        return '--:--';
    }
}

   async renderScheduleGrid(startDate, sessions) {
        const grid = document.getElementById('scheduleGrid');
        grid.innerHTML = '';

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const daySessions = sessions.filter(session => 
                new Date(session.date).toDateString() === currentDate.toDateString()
            );

            // СОРТИРУЕМ занятия по времени
            const sortedSessions = this.sortSessionsByTime(daySessions);

            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';
            dayColumn.innerHTML = `
                <div class="day-header">
                    <h4>${currentDate.toLocaleDateString('ru-RU', { weekday: 'long' })}</h4>
                    <p>${currentDate.toLocaleDateString()}</p>
                </div>
            `;

            sortedSessions.forEach(session => {
                const sessionElement = document.createElement('div');
                sessionElement.className = 'session-card';
                
                const isFull = session.bookingsCount >= session.maxParticipants;
                const percentage = Math.min((session.bookingsCount / session.maxParticipants) * 100, 100);
                
                // Получаем продолжительность из данных занятия
                const duration = session.duration || 60;
                
                // Проверяем наличие необходимых данных
                const endTime = session.time && duration ? 
                    this.calculateEndTime(session.time, duration) : 
                    '--:--';
                
                sessionElement.innerHTML = `
                    <div class="session-time">${session.time} - ${endTime}</div>
                    <div class="session-type">${session.classTypeName}</div>
                    <div class="session-trainer">Тренер: ${session.trainer}</div>
                    <div class="session-clients ${isFull ? 'full' : ''}">
                        Записано: ${session.bookingsCount}/${session.maxParticipants}
                    </div>
                    <div class="session-progress">
                        <div class="session-progress-bar" style="width: ${percentage}%"></div>
                    </div>
                    <button class="btn btn-calendar" onclick="app.addToCalendar(event, ${session.id})">
                        <i class="fas fa-calendar-plus"></i> В календарь
                    </button>
                `;
                sessionElement.addEventListener('click', (e) => {
                    // Проверяем, что клик был не по кнопке календаря
                    if (!e.target.closest('.btn-calendar')) {
                        this.showSessionDetails(session.id);
                    }
                });
                dayColumn.appendChild(sessionElement);
            });

            const addButton = document.createElement('button');
            addButton.className = 'btn btn-primary';
            addButton.innerHTML = '<i class="fas fa-plus"></i> Добавить занятие';
            addButton.addEventListener('click', () => {
                this.showAddSessionModal(currentDate);
            });
            dayColumn.appendChild(addButton);

            grid.appendChild(dayColumn);
        }
    }

    // НОВЫЙ МЕТОД: Добавление в календарь с персонализацией и адресом из строки описания
    async addToCalendar(event, sessionId) {
        event.stopPropagation(); // Предотвращаем всплытие события
        
        try {
            const session = await this.getSession(sessionId);
            const classType = await this.getClassType(session.classType);
            
            if (!session || !classType) {
                this.showNotification('Ошибка загрузки данных занятия', 'error');
                return;
            }

            // Получаем список записей на это занятие
            const bookings = await this.getSessionBookings(sessionId);
            let clientName = null;

            // Если запись только одна, получаем имя клиента
            if (bookings.length === 1) {
                const client = await this.getClient(bookings[0].clientId);
                clientName = client ? client.name : null;
            }

            // Создаем дату и время начала
            const startDateTime = new Date(`${session.date}T${session.time}:00`);
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + classType.duration);

            // Форматируем даты для iCalendar
            const formatDateForICS = (date) => {
                return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            };

            // Формируем название события
            let eventTitle = classType.name;
            if (bookings.length === 1 && clientName) {
                eventTitle = `${classType.name} (${clientName})`;
            }

            // Извлекаем адрес из описания (предполагаем, что адрес в начале описания)
            let location = 'Yoga Studio'; // значение по умолчанию
            if (classType.description) {
                // Попробуем найти адрес в описании (первая строка или часть текста)
                const descriptionLines = classType.description.split('\n');
                if (descriptionLines[0] && descriptionLines[0].trim().length > 0) {
                    location = descriptionLines[0].trim();
                } else {
                    // Если нет переноса строк, используем первое предложение
                    const firstSentence = classType.description.split('.')[0];
                    if (firstSentence && firstSentence.trim().length > 0) {
                        location = firstSentence.trim();
                    }
                }
            }

            // Формируем описание
            let description = `Тренер: ${session.trainer}\nТип занятия: ${classType.name}`;
            if (classType.description) {
                // Добавляем полное описание без первой строки (адреса)
                const descriptionWithoutLocation = classType.description
                    .split('\n')
                    .slice(1)
                    .join('\n')
                    .trim();
                
                if (descriptionWithoutLocation) {
                    description += `\nОписание: ${descriptionWithoutLocation}`;
                }
            }
            if (bookings.length === 1 && clientName) {
                description += `\nЗапись для: ${clientName}`;
            } else if (bookings.length > 0) {
                description += `\nЗаписей: ${bookings.length}`;
            }

            // Создаем содержимое .ics файла
            const icsContent = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                'PRODID:-//Yoga Studio//RU',
                'BEGIN:VEVENT',
                `UID:${session.id}@yogastudio`,
                `DTSTAMP:${formatDateForICS(new Date())}`,
                `DTSTART:${formatDateForICS(startDateTime)}`,
                `DTEND:${formatDateForICS(endDateTime)}`,
                `SUMMARY:${this.escapeIcsText(eventTitle)}`,
                `DESCRIPTION:${this.escapeIcsText(description)}`,
                `LOCATION:${this.escapeIcsText(location)}`,
                'END:VEVENT',
                'END:VCALENDAR'
            ].join('\r\n');

            // Создаем Blob и ссылку для скачивания
            const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            // Создаем временную ссылку для скачивания
            const link = document.createElement('a');
            link.href = url;
            
            // Формируем имя файла с учетом клиента
            let fileName = `yoga-${session.date}-${session.time}`;
            if (bookings.length === 1 && clientName) {
                const clientNameSlug = clientName.replace(/\s+/g, '-').toLowerCase();
                fileName = `yoga-${clientNameSlug}-${session.date}`;
            }
            link.download = `${fileName}.ics`;
            
            document.body.appendChild(link);
            link.click();
            
            // Очищаем
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);

            this.showNotification('Файл календаря скачан. Откройте его для добавления в приложение Календарь', 'success');

        } catch (error) {
            console.error('Ошибка при создании файла календаря:', error);
            this.showNotification('Ошибка при создании файла календаря', 'error');
        }
    }

    // НОВЫЙ МЕТОД: Экранирование текста для iCalendar
    escapeIcsText(text) {
        if (!text) return '';
        // Экранируем специальные символы для iCalendar
        return text
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    // НОВЫЙ МЕТОД: Получение всех записей на занятие
    async getSessionBookings(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['bookings'], 'readonly');
            const store = transaction.objectStore('bookings');
            const index = store.index('sessionId');
            const request = index.getAll(IDBKeyRange.only(sessionId));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateStats() {
        const totalClients = await this.getTotalClients();
        const weekSessions = await this.getWeekSessionsCount();
        const avgAttendance = await this.getAverageAttendance();

        document.getElementById('totalClients').textContent = totalClients;
        document.getElementById('weekSessions').textContent = weekSessions;
        document.getElementById('avgAttendance').textContent = `${avgAttendance}%`;
    }

    showModal(title, content) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modalOverlay').style.display = 'flex';
    }

    hideModal() {
        document.getElementById('modalOverlay').style.display = 'none';
    }

    showAddSessionModal(date = null) {
        // Используем переданную дату или текущую дату
        let defaultDate;
        if (date) {
            // Если передана дата из расписания, используем её
             defaultDate = new Date(date);
        } else {
            // Иначе используем текущую дату
            defaultDate = new Date();
        }
    
        // Приводим дату к формату YYYY-MM-DD без учета часового пояса
        const year = defaultDate.getFullYear();
        const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
        const day = String(defaultDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
    
        this.getAllClassTypes().then(classTypes => {
            const content = `
                <form id="addSessionForm">
                    <div class="form-group">
                        <label>Дата:</label>
                        <input type="date" id="sessionDate" value="${formattedDate}" required>
                    </div>
                    <div class="form-group">
                        <label>Время:</label>
                        <input type="time" id="sessionTime" value="10:00" required>
                    </div>
                    <div class="form-group">
                        <label>Тип занятия:</label>
                        <select id="sessionClassType" required>
                            ${classTypes.map(cls => 
                                 `<option value="${cls.id}">${cls.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Тренер:</label>
                        <input type="text" id="sessionTrainer" required>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                        <button type="submit" class="btn btn-primary">Сохранить</button>
                    </div>
                </form>
            `;

            this.showModal('Добавить занятие', content);

            document.getElementById('addSessionForm').addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSession();
            });
        }).catch(error => {
            console.error('Ошибка загрузки типов занятий:', error);
            this.showNotification('Ошибка загрузки типов занятий', 'error');
        });
    }

    showAddClientModal() {
        const content = `
            <form id="addClientForm">
                <div class="form-group">
                    <label>ФИО:</label>
                    <input type="text" id="clientName" required>
                </div>
                <div class="form-group">
                    <label>Телефон:</label>
                    <input type="tel" id="clientPhone" required>
                </div>
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" id="clientEmail">
                </div>
                <div class="form-group">
                    <label>Примечания:</label>
                    <textarea id="clientNotes"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;

        this.showModal('Добавить клиента', content);

        document.getElementById('addClientForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveClient();
        });
    }

    showAddClassModal() {
        const content = `
            <form id="addClassForm">
                <div class="form-group">
                    <label>Название:</label>
                    <input type="text" id="className" required>
                </div>
                <div class="form-group">
                    <label>Продолжительность (мин):</label>
                    <input type="number" id="classDuration" min="30" max="180" required>
                </div>
                <div class="form-group">
                    <label>Макс. участников:</label>
                    <input type="number" id="classMaxParticipants" min="1" max="50" required>
                </div>
                <div class="form-group">
                    <label>Описание:</label>
                    <textarea id="classDescription"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;

        this.showModal('Добавить тип занятия', content);

        document.getElementById('addClassForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveClassType();
        });
    }

    async getAllClassTypes() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['classTypes'], 'readonly');
            const store = transaction.objectStore('classTypes');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllClients() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readonly');
            const store = transaction.objectStore('clients');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSessionsForWeek(startDate, endDate) {
        console.log('Запрос занятий с', startDate.toISOString(), 'по', endDate.toISOString());
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const sessionStore = transaction.objectStore('sessions');
       
            // Получаем ВСЕ занятия из базы
            const request = sessionStore.getAll();
    
            request.onsuccess = async () => {
                 const allSessions = request.result;
        
                // Фильтруем занятия на стороне клиента по диапазону дат
                const filteredSessions = allSessions.filter(session => {
                    try {
                        // Преобразуем строку даты в объект Date для сравнения
                        const sessionDate = new Date(session.date);
                        // Нормализуем даты (убираем время для точного сравнения)
                        const normalizedSessionDate = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
                        const normalizedStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                        const normalizedEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                
                        return normalizedSessionDate >= normalizedStartDate && 
                               normalizedSessionDate <= normalizedEndDate;
                    } catch (error) {
                        console.error('Ошибка при обработке даты занятия:', session.date, error);
                        return false;
                    }
                });
        
                console.log('Найдено занятий после фильтрации:', filteredSessions.length);
        
                // Получаем детальную информацию для каждого занятия
                const sessionsWithDetails = await Promise.all(filteredSessions.map(async (session) => {
                    try {
                        let classTypeName = 'Неизвестный тип';
                        let maxParticipants = 10;
                        let duration = 60; // значение по умолчанию

                        if (session.classType) {
                            const classType = await this.getClassType(session.classType);
                            classTypeName = classType?.name || 'Неизвестный тип';
                            maxParticipants = classType?.maxParticipants || 10;
                            duration = classType?.duration || 60; // добавляем продолжительность
                        }

                        const bookingsCount = await this.getSessionBookingsCount(session.id);

                        return {
                            ...session,
                            classTypeName,
                            maxParticipants,
                            duration, // добавляем продолжительность в объект занятия
                            bookingsCount
                        };
                    } catch (error) {
                         console.error('Ошибка при загрузке данных занятия:', error, session);
                        return {
                            ...session,
                            classTypeName: 'Ошибка загрузки',
                            maxParticipants: 10,
                            duration: 60,
                            bookingsCount: 0
                        };
                    }
                 }));

                resolve(sessionsWithDetails);
            };
    
            request.onerror = () => {
                console.error('Ошибка при получении занятий:', request.error);
                reject(request.error);
            };
        });
    }

    async getClassType(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['classTypes'], 'readonly');
            const store = transaction.objectStore('classTypes');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSessionBookingsCount(sessionId) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['bookings'], 'readonly');
        const store = transaction.objectStore('bookings');
        const index = store.index('sessionId');
        const request = index.count(IDBKeyRange.only(sessionId)); // ИСПОЛЬЗУЕМ COUNT вместо GETALL

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

    async saveSession() {
    const formData = {
        date: document.getElementById('sessionDate').value,
        time: document.getElementById('sessionTime').value,
        classType: parseInt(document.getElementById('sessionClassType').value),
        trainer: document.getElementById('sessionTrainer').value
    };

    // Проверяем, нет ли уже занятия в это время
    const existingSessions = await this.getSessionsForDate(formData.date);
    const timeConflict = existingSessions.some(session => session.time === formData.time);
    
    if (timeConflict) {
        this.showNotification('В это время уже есть занятие', 'error');
        return;
        }

    await this.addSession(formData);
    this.hideModal();
    this.updateSchedule();
    }

async getSessionsForDate(date) {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        const index = store.index('date');
        const request = index.getAll(IDBKeyRange.only(date));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        });
    }
    async saveClient() {
    const formData = {
        name: document.getElementById('clientName').value,
        phone: document.getElementById('clientPhone').value,
        email: document.getElementById('clientEmail').value,
        notes: document.getElementById('clientNotes').value
    };

    // Добавить валидацию телефона
    if (formData.phone && !this.isValidPhone(formData.phone)) {
        this.showNotification('Неверный формат телефона. Используйте формат: +7 900 123-45-67', 'error');
        return;
    }

    // Проверяем уникальность телефона
    if (formData.phone) {
        const existingClients = await this.getAllClients();
        const duplicate = existingClients.find(client => 
            client.phone && client.phone === formData.phone
        );
        
        if (duplicate) {
            this.showNotification('Клиент с таким телефоном уже существует', 'error');
            return;
        }
    }

    await this.addClient(formData);
    this.hideModal();
    this.loadClients();
}
    async saveClassType() {
        const formData = {
            name: document.getElementById('className').value,
            duration: parseInt(document.getElementById('classDuration').value),
            maxParticipants: parseInt(document.getElementById('classMaxParticipants').value),
            description: document.getElementById('classDescription').value
        };

        await this.addClassType(formData);
        this.hideModal();
        this.loadClassTypes();
    }

    getCurrentWeek() {
    const today = new Date();
    const monday = new Date(today);
    
    // Получаем понедельник текущей недели
    // getDay() возвращает 0 для воскресенья, 1 для понедельника и т.д.
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    
    return monday;
    }

    searchClients(term) {
        this.loadClients(term);
    }

    async syncData() {
    const syncBtn = document.getElementById('syncBtn');
    this.setLoading(syncBtn, true);
    
    try {
        // Имитация синхронизации
        await new Promise(resolve => setTimeout(resolve, 2000));
        this.showNotification('Данные синхронизированы!', 'success');
    } catch (error) {
        this.showNotification('Ошибка синхронизации', 'error');
    } finally {
        this.setLoading(syncBtn, false);
    }
}

    async addSession(session) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            const request = store.add(session);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async addClient(client) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readwrite');
            const store = transaction.objectStore('clients');
            const request = store.add(client);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async addClassType(classType) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['classTypes'], 'readwrite');
            const store = transaction.objectStore('classTypes');
            const request = store.add(classType);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getTotalClients() {
        const clients = await this.getAllClients();
        return clients.length;
    }

    async getWeekSessionsCount() {
        const startDate = new Date(this.currentWeek);
        startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const sessions = await this.getSessionsForWeek(startDate, endDate);
        return sessions.length;
    }

    async getAverageAttendance() {
        const startDate = new Date(this.currentWeek.getFullYear(), this.currentWeek.getMonth(), 1);
        const endDate = new Date(this.currentWeek.getFullYear(), this.currentWeek.getMonth() + 1, 0);

        const sessions = await this.getSessionsForWeek(startDate, endDate);

        if (sessions.length === 0) return 0;

        const totalAttendance = sessions.reduce((sum, session) => {
            return sum + (session.bookingsCount / session.maxParticipants);
        }, 0);

        return Math.round((totalAttendance / sessions.length) * 100);
    }


     async deleteClassType(classTypeId) {
        try {
            const classType = await this.getClassType(classTypeId);
            if (!classType) {
                this.showNotification('Тип занятия не найден', 'error');
                return;
            }

            // Проверяем использование типа занятия
            const usageCount = await this.getClassTypeUsageCount(classTypeId);
            
            if (usageCount > 0) {
                // Показываем диалог выбора
                this.showDeleteClassTypeDialog(classType, usageCount);
            } else {
                if (confirm('Вы уверены, что хотите удалить этот тип занятия?')) {
                    await this.deleteClassTypeFromDB(classTypeId);
                    this.loadClassTypes();
                    this.showNotification('Тип занятия успешно удален', 'success');
                }
            }
        } catch (error) {
            this.showNotification('Ошибка при удалении типа занятия', 'error');
            console.error('Ошибка удаления типа занятия:', error);
        }
    }

    showDeleteClassTypeDialog(classType, usageCount) {
        const content = `
            <div class="delete-dialog">
                <div class="warning-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Удаление типа занятия</h3>
                <p>Тип занятия <strong>"${this.escapeHtml(classType.name)}"</strong> используется в <strong>${usageCount}</strong> занятии(ях) в расписании.</p>
                
                <div class="delete-options">
                    <label class="option-item">
                        <input type="radio" name="deleteOption" value="deleteAll" checked>
                        <div class="option-content">
                            <h4>Удалить полностью</h4>
                            <p>Удалить тип занятия и все связанные занятия из расписания</p>
                        </div>
                    </label>
                    
                    <label class="option-item">
                        <input type="radio" name="deleteOption" value="keepSessions">
                        <div class="option-content">
                            <h4>Оставить занятия</h4>
                            <p>Удалить только тип занятия, оставив занятия в расписании (они станут "Неизвестный тип")</p>
                        </div>
                    </label>
                    
                    <label class="option-item">
                        <input type="radio" name="deleteOption" value="replaceWith">
                        <div class="option-content">
                            <h4>Заменить на другой тип</h4>
                            <p>Удалить этот тип и заменить его на другой во всех занятиях</p>
                            <select id="replaceClassType" class="replace-select">
                                <option value="">Выберите тип занятия</option>
                            </select>
                        </div>
                    </label>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                    <button type="button" class="btn btn-danger" onclick="app.confirmClassTypeDelete(${classType.id})">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `;

        this.showModal('Удаление типа занятия', content);

        // Загружаем доступные типы занятий для замены
        this.getAllClassTypes().then(classTypes => {
            const select = document.getElementById('replaceClassType');
            const otherTypes = classTypes.filter(type => type.id !== classType.id);
            
            select.innerHTML = '<option value="">Выберите тип занятия</option>' + 
                otherTypes.map(type => 
                    `<option value="${type.id}">${type.name}</option>`
                ).join('');
            
            // Показываем/скрываем select при выборе опции
            document.querySelectorAll('input[name="deleteOption"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const replaceSelect = document.getElementById('replaceClassType');
                    replaceSelect.style.display = e.target.value === 'replaceWith' ? 'block' : 'none';
                });
            });
        }).catch(error => {
            console.error('Ошибка загрузки типов занятий:', error);
        });
    }

    async confirmClassTypeDelete(classTypeId) {
        const selectedOption = document.querySelector('input[name="deleteOption"]:checked').value;
        const replaceTypeId = document.getElementById('replaceClassType')?.value;

        try {
            if (selectedOption === 'replaceWith' && !replaceTypeId) {
                this.showNotification('Выберите тип занятия для замены', 'error');
                return;
            }

            let message = '';
            
            switch (selectedOption) {
                case 'deleteAll':
                    message = 'Вы уверены, что хотите удалить тип занятия и все связанные занятия?';
                    break;
                case 'keepSessions':
                    message = 'Вы уверены, что хотите удалить тип занятия? Связанные занятия останутся с пометкой "Неизвестный тип".';
                    break;
                case 'replaceWith':
                    const replaceType = await this.getClassType(parseInt(replaceTypeId));
                    message = `Вы уверены, что хотите удалить тип занятия и заменить его на "${replaceType.name}" во всех занятиях?`;
                    break;
            }

            if (!confirm(message)) {
                return;
            }

            // Выполняем удаление в соответствии с выбранной опцией
            switch (selectedOption) {
                case 'deleteAll':
                    await this.deleteClassTypeWithSessions(classTypeId);
                    break;
                case 'keepSessions':
                    await this.deleteClassTypeKeepSessions(classTypeId);
                    break;
                case 'replaceWith':
                    await this.replaceClassType(classTypeId, parseInt(replaceTypeId));
                    break;
            }

            this.hideModal();
            this.loadClassTypes();
            this.updateSchedule(); // Обновляем расписание если нужно
            this.showNotification('Тип занятия успешно удален', 'success');

        } catch (error) {
            this.showNotification('Ошибка при удалении типа занятия', 'error');
            console.error('Ошибка удаления типа занятия:', error);
        }
    }

    async deleteClassTypeWithSessions(classTypeId) {
        // Удаляем связанные занятия и их записи
        const sessions = await this.getSessionsByClassType(classTypeId);
        
        for (const session of sessions) {
            await this.deleteSessionBookings(session.id);
            await this.deleteSessionFromDB(session.id);
        }
        
        await this.deleteClassTypeFromDB(classTypeId);
    }

    async deleteClassTypeKeepSessions(classTypeId) {
        // Просто удаляем тип занятия, занятия останутся с classType = null
        await this.deleteClassTypeFromDB(classTypeId);
    }

    async replaceClassType(oldClassTypeId, newClassTypeId) {
        // Заменяем тип занятия во всех связанных занятиях
        const sessions = await this.getSessionsByClassType(oldClassTypeId);
        
        for (const session of sessions) {
            await this.updateSessionInDB(session.id, {
                ...session,
                classType: newClassTypeId
            });
        }
        
        await this.deleteClassTypeFromDB(oldClassTypeId);
    }

    async getSessionsByClassType(classTypeId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const index = store.index('classType');
            const request = index.getAll(IDBKeyRange.only(classTypeId));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getClassTypeUsageCount(classTypeId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const index = store.index('classType');
            const request = index.count(IDBKeyRange.only(classTypeId));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteClassTypeFromDB(classTypeId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['classTypes'], 'readwrite');
            const store = transaction.objectStore('classTypes');
            const request = store.delete(classTypeId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

 
async editClassType(classTypeId) {
    try {
        const classType = await this.getClassType(classTypeId);
        if (!classType) {
            this.showNotification('Тип занятия не найден', 'error');
            return;
        }

        const content = `
            <form id="editClassForm">
                <input type="hidden" id="editClassId" value="${classType.id}">
                <div class="form-group">
                    <label>Название:</label>
                    <input type="text" id="editClassName" value="${this.escapeHtml(classType.name)}" required>
                </div>
                <div class="form-group">
                    <label>Продолжительность (мин):</label>
                    <input type="number" id="editClassDuration" value="${classType.duration}" min="30" max="180" required>
                </div>
                <div class="form-group">
                    <label>Макс. участников:</label>
                    <input type="number" id="editClassMaxParticipants" value="${classType.maxParticipants}" min="1" max="50" required>
                </div>
                <div class="form-group">
                    <label>Описание:</label>
                    <textarea id="editClassDescription">${this.escapeHtml(classType.description || '')}</textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить изменения</button>
                </div>
            </form>
        `;

        this.showModal('Редактирование типа занятия', content);

        document.getElementById('editClassForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateClassType();
        });

    } catch (error) {
        console.error('Ошибка при загрузке типа занятия:', error);
        this.showNotification('Ошибка при загрузке типа занятия', 'error');
    }
}

async updateClassType() {
    const classTypeId = parseInt(document.getElementById('editClassId').value);
    const formData = {
        name: document.getElementById('editClassName').value,
        duration: parseInt(document.getElementById('editClassDuration').value),
        maxParticipants: parseInt(document.getElementById('editClassMaxParticipants').value),
        description: document.getElementById('editClassDescription').value
    };

    try {
        await this.updateClassTypeInDB(classTypeId, formData);
        this.hideModal();
        this.loadClassTypes();
        this.showNotification('Тип занятия успешно обновлён', 'success');
    } catch (error) {
        this.showNotification('Ошибка при обновлении типа занятия', 'error');
        console.error('Ошибка обновления типа занятия:', error);
    }
}

async updateClassTypeInDB(classTypeId, classTypeData) {
    // Реализация аналогична updateClientInDB
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['classTypes'], 'readwrite');
        const store = transaction.objectStore('classTypes');
        const getRequest = store.get(classTypeId);
        getRequest.onsuccess = () => {
            const existingClassType = getRequest.result;
            if (!existingClassType) {
                reject(new Error('Тип занятия не найден'));
                return;
            }
            const updatedClassType = { ...existingClassType, ...classTypeData };
            const putRequest = store.put(updatedClassType);
            putRequest.onsuccess = () => resolve(putRequest.result);
            putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}


   async editClient(clientId) {
        try {
            const client = await this.getClient(clientId);
            if (!client) {
                this.showNotification('Клиент не найден', 'error');
                return;
            }

            const content = `
                <form id="editClientForm">
                    <input type="hidden" id="editClientId" value="${client.id}">
                    <div class="form-group">
                        <label>ФИО:</label>
                        <input type="text" id="editClientName" value="${this.escapeHtml(client.name)}" required>
                    </div>
                    <div class="form-group">
                        <label>Телефон:</label>
                        <input type="tel" id="editClientPhone" value="${this.escapeHtml(client.phone || '')}" 
            placeholder="+7 900 123 45 67" oninput="app.formatPhone(this)">
                    </div>
                    <div class="form-group">
                        <label>Email:</label>
                        <input type="email" id="editClientEmail" value="${this.escapeHtml(client.email || '')}">
                    </div>
                    <div class="form-group">
                        <label>Примечания:</label>
                        <textarea id="editClientNotes">${this.escapeHtml(client.notes || '')}</textarea>
                    </div>
                    <div class="client-info">
                        <h4>Информация о клиенте</h4>
                        <p>Всего записей: <span id="clientBookingsCount">Загрузка...</span></p>
                        <p>Предстоящие записи: <span id="clientUpcomingBookings">Загрузка...</span></p>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" onclick="app.showDeleteClientDialog(${client.id})">
                            <i class="fas fa-trash"></i> Удалить клиента
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                        <button type="submit" class="btn btn-primary">Сохранить изменения</button>
                    </div>
                </form>
            `;

            this.showModal('Редактирование клиента', content);

            // Загружаем статистику клиента
            this.getClientBookingsCount(clientId).then(count => {
                document.getElementById('clientBookingsCount').textContent = count.total;
                document.getElementById('clientUpcomingBookings').textContent = count.upcoming;
            });

            document.getElementById('editClientForm').addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateClient();
            });

        } catch (error) {
            console.error('Ошибка при загрузке клиента:', error);
            this.showNotification('Ошибка при загрузке клиента', 'error');
        }
    }

    async updateClient() {
       const clientId = parseInt(document.getElementById('editClientId').value);
       const formData = {
           name: document.getElementById('editClientName').value,
           phone: document.getElementById('editClientPhone').value,
           email: document.getElementById('editClientEmail').value,
           notes: document.getElementById('editClientNotes').value
       };

    try {
        // Проверяем уникальность телефона только если он не пустой
        if (formData.phone) {
            const existingClients = await this.getAllClients();
            const duplicate = existingClients.find(client => 
                client.phone && client.phone === formData.phone && client.id !== clientId
            );

            if (duplicate) {
                this.showNotification('Клиент с таким телефоном уже существует', 'error');
                return;
            }
        }

        await this.updateClientInDB(clientId, formData);
        this.hideModal();
        this.loadClients();
        this.showNotification('Данные клиента успешно обновлены', 'success');
    } catch (error) {
        this.showNotification('Ошибка при обновлении клиента', 'error');
        console.error('Ошибка обновления клиента:', error);
    }
}

    async updateClientInDB(clientId, clientData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readwrite');
            const store = transaction.objectStore('clients');
            
            const getRequest = store.get(clientId);
            
            getRequest.onsuccess = () => {
                const existingClient = getRequest.result;
                if (!existingClient) {
                    reject(new Error('Клиент не найден'));
                    return;
                }

                const updatedClient = {
                    ...existingClient,
                    ...clientData
                };

                const putRequest = store.put(updatedClient);
                
                putRequest.onsuccess = () => resolve(putRequest.result);
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async showDeleteClientDialog(clientId) {
        const client = await this.getClient(clientId);
        const bookingsCount = await this.getClientBookingsCount(clientId);

        const content = `
            <div class="delete-dialog">
                <div class="warning-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Удаление клиента</h3>
                <p>Клиент <strong>"${this.escapeHtml(client.name)}"</strong> имеет <strong>${bookingsCount.total}</strong> записей на занятия.</p>
                <p>Из них предстоящих: <strong>${bookingsCount.upcoming}</strong></p>
                
                <div class="delete-options">
                    <label class="option-item">
                        <input type="radio" name="deleteClientOption" value="deleteAll" checked>
                        <div class="option-content">
                            <h4>Удалить полностью</h4>
                            <p>Удалить клиента и все его записи на занятия</p>
                        </div>
                    </label>
                    
                    <label class="option-item">
                        <input type="radio" name="deleteClientOption" value="deleteUpcoming">
                        <div class="option-content">
                            <h4>Удалить только предстоящие записи</h4>
                            <p>Удалить клиента, но оставить записи на прошедшие занятия</p>
                        </div>
                    </label>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                    <button type="button" class="btn btn-danger" onclick="app.confirmClientDelete(${clientId})">
                        <i class="fas fa-trash"></i> Удалить клиента
                    </button>
                </div>
            </div>
        `;

        this.showModal('Удаление клиента', content);
    }

    async confirmClientDelete(clientId) {
        const selectedOption = document.querySelector('input[name="deleteClientOption"]:checked').value;

        try {
            let message = '';
            
            switch (selectedOption) {
                case 'deleteAll':
                    message = 'Вы уверены, что хотите удалить клиента и все его записи?';
                    break;
                case 'deleteUpcoming':
                    message = 'Вы уверены, что хотите удалить клиента? Будут удалены только предстоящие записи.';
                    break;
            }

            if (!confirm(message)) {
                return;
            }

            // Выполняем удаление в соответствии с выбранной опцией
            switch (selectedOption) {
                case 'deleteAll':
                    await this.deleteClientWithAllBookings(clientId);
                    break;
                case 'deleteUpcoming':
                    await this.deleteClientWithUpcomingBookings(clientId);
                    break;
            }

            this.hideModal();
            this.loadClients();
            this.showNotification('Клиент успешно удален', 'success');

        } catch (error) {
            this.showNotification('Ошибка при удалении клиента', 'error');
            console.error('Ошибка удаления клиента:', error);
        }
    }

    async deleteClientWithAllBookings(clientId) {
        // Удаляем все записи клиента
        const bookings = await this.getClientBookings(clientId);
        
        for (const booking of bookings) {
            await this.deleteBookingFromDB(booking.id);
        }
        
        await this.deleteClientFromDB(clientId);
    }

    async deleteClientWithUpcomingBookings(clientId) {
        // Удаляем только предстоящие записи
        const bookings = await this.getClientBookings(clientId);
        const now = new Date().toISOString();
        
        for (const booking of bookings) {
            const session = await this.getSession(booking.sessionId);
            if (session && new Date(`${session.date}T${session.time}:00`) > new Date(now)) {
                await this.deleteBookingFromDB(booking.id);
            }
        }
        
        await this.deleteClientFromDB(clientId);
    }

    async deleteClientFromDB(clientId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readwrite');
            const store = transaction.objectStore('clients');
            const request = store.delete(clientId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getClient(clientId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['clients'], 'readonly');
            const store = transaction.objectStore('clients');
            const request = store.get(clientId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getClientBookingsCount(clientId) {
        const bookings = await this.getClientBookings(clientId);
        const now = new Date().toISOString();
        
        const upcomingBookings = await Promise.all(
            bookings.map(async (booking) => {
                const session = await this.getSession(booking.sessionId);
                return session && new Date(`${session.date}T${session.time}:00`) > new Date(now);
            })
        );
        const upcoming = upcomingBookings.filter(Boolean).length;

        return {
            total: bookings.length,
            upcoming: upcoming
        };
    }

    async getClientBookings(clientId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['bookings'], 'readonly');
            const store = transaction.objectStore('bookings');
            const index = store.index('clientId');
            const request = index.getAll(IDBKeyRange.only(clientId));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteBookingFromDB(bookingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['bookings'], 'readwrite');
            const store = transaction.objectStore('bookings');
            const request = store.delete(bookingId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async viewClientBookings(clientId) {
        try {
            const client = await this.getClient(clientId);
            const bookings = await this.getClientBookings(clientId);
            
            let bookingsContent = '';
            
            if (bookings.length === 0) {
                bookingsContent = '<p>У клиента нет записей на занятия.</p>';
            } else {
                // Группируем записи по дате
                const groupedBookings = {};
                
                for (const booking of bookings) {
                    const session = await this.getSession(booking.sessionId);
                    if (session) {
                        const classType = await this.getClassType(session.classType);
                        const dateKey = session.date;
                        
                        if (!groupedBookings[dateKey]) {
                            groupedBookings[dateKey] = [];
                        }
                        
                        groupedBookings[dateKey].push({
                            session: session,
                            classType: classType,
                            booking: booking
                        });
                    }
                }
                
                // Сортируем даты
                const sortedDates = Object.keys(groupedBookings).sort();
                
                bookingsContent = sortedDates.map(date => `
                    <div class="bookings-date-group">
                        <h4>${new Date(date).toLocaleDateString('ru-RU')}</h4>
                        ${groupedBookings[date].map(item => `
                            <div class="booking-item">
                                <div class="booking-info">
                                    <strong>${item.session.time}</strong> - ${item.classType?.name || 'Неизвестный тип'}
                                    <br><small>Тренер: ${item.session.trainer}</small>
                                </div>
                                <button class="btn btn-danger btn-sm" onclick="app.deleteClientBooking(${item.booking.id}, ${clientId})">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `).join('');
            }

            const content = `
                <div class="client-bookings">
                    <h3>Записи клиента: ${this.escapeHtml(client.name)}</h3>
                    ${bookingsContent}
                    <div class="form-actions">
                        <button class="btn btn-primary" onclick="app.showAddBookingModal(${clientId})">
                            <i class="fas fa-plus"></i> Добавить запись
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Закрыть</button>
                    </div>
                </div>
            `;

            this.showModal('Записи клиента', content);

        } catch (error) {
            console.error('Ошибка при загрузке записей клиента:', error);
            this.showNotification('Ошибка при загрузке записей', 'error');
        }
    }

    async showAddBookingModal(clientId) {
        // Получаем список занятий на ближайшие 2 недели
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 14);
        
        const sessions = await this.getSessionsForWeek(startDate, endDate);
        
        // Фильтруем занятия, где есть свободные места
        const availableSessions = sessions.filter(session => 
            session.bookingsCount < session.maxParticipants
        );

        const content = `
            <div class="add-booking">
                <h3>Добавить запись на занятие</h3>
                ${availableSessions.length === 0 ? 
                    '<p>Нет доступных занятий на ближайшие 2 недели</p>' :
                    `
                    <div class="form-group">
                        <label>Выберите занятие:</label>
                        <select id="bookingSession" required>
                            <option value="">Выберите занятие</option>
                            ${availableSessions.map(session => `
                                <option value="${session.id}">
                                    ${new Date(session.date).toLocaleDateString('ru-RU')} ${session.time} - 
                                    ${session.classTypeName} (${session.bookingsCount}/${session.maxParticipants})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                        <button type="button" class="btn btn-primary" onclick="app.addClientBooking(${clientId})">Добавить запись</button>
                    </div>
                    `
                }
            </div>
        `;

        this.showModal('Добавить запись', content);
    }

    async addClientBooking(clientId) {
        const sessionId = parseInt(document.getElementById('bookingSession').value);
        
        if (!sessionId) {
            this.showNotification('Выберите занятие', 'error');
            return;
        }

        try {
            // Проверяем, не записан ли уже клиент на это занятие
            const existingBooking = await this.getClientSessionBooking(clientId, sessionId);
            if (existingBooking) {
                this.showNotification('Клиент уже записан на это занятие', 'error');
                return;
            }

            // Проверяем свободные места
            const session = await this.getSession(sessionId);
            const classType = await this.getClassType(session.classType);
            const bookingsCount = await this.getSessionBookingsCount(sessionId);
            
            if (bookingsCount >= classType.maxParticipants) {
                this.showNotification('На это занятие нет свободных мест', 'error');
                return;
            }

            await this.addBooking({
                clientId: clientId,
                sessionId: sessionId,
                bookingDate: new Date().toISOString()
            });

            this.hideModal();
            this.showNotification('Запись успешно добавлена', 'success');
            this.viewClientBookings(clientId); // Обновляем список записей

        } catch (error) {
            this.showNotification('Ошибка при добавлении записи', 'error');
            console.error('Ошибка добавления записи:', error);
        }
    }

    async getClientSessionBooking(clientId, sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['bookings'], 'readonly');
            const store = transaction.objectStore('bookings');
            const index = store.index('sessionId');
            const request = index.getAll(IDBKeyRange.only(sessionId));

            request.onsuccess = () => {
                const booking = request.result.find(b => b.clientId === clientId);
                resolve(booking);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async addBooking(bookingData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['bookings'], 'readwrite');
            const store = transaction.objectStore('bookings');
            const request = store.add(bookingData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteClientBooking(bookingId, clientId) {
        if (!confirm('Вы уверены, что хотите удалить эту запись?')) {
            return;
        }

        try {
            await this.deleteBookingFromDB(bookingId);
            this.showNotification('Запись успешно удалена', 'success');
            this.viewClientBookings(clientId); // Обновляем список
        } catch (error) {
            this.showNotification('Ошибка при удалении записи', 'error');
            console.error('Ошибка удаления записи:', error);
        }
    }

    formatPhone(input) {
    // Очищаем от всего, кроме цифр
    let value = input.value.replace(/\D/g, '');
    
    // Если поле пустое, оставляем как есть
    if (value === '') {
        input.value = '';
        return;
    }

    // Убираем лидирующую 8, заменяем на 7 (российский формат)
    if (value.startsWith('8') && value.length > 1) {
        value = '7' + value.substring(1);
    }
    // Если номер не начинается с 7, добавляем код России
    else if (!value.startsWith('7') && value.length > 0) {
        value = '7' + value;
    }

    // Форматируем по шаблону +7 999 123-45-67
    let formattedValue = '+7';
    if (value.length > 1) {
        formattedValue += ' ' + value.substring(1, 4);
    }
    if (value.length > 4) {
        formattedValue += ' ' + value.substring(4, 7);
    }
    if (value.length > 7) {
        formattedValue += '-' + value.substring(7, 9);
    }
    if (value.length > 9) {
        formattedValue += '-' + value.substring(9, 11);
    }

    input.value = formattedValue;
}

    // Обновляем метод showAddClientModal
    showAddClientModal() {
        const content = `
            <form id="addClientForm">
                <div class="form-group">
                    <label>ФИО:</label>
                    <input type="text" id="clientName" required>
                </div>
                <div class="form-group">
                    <label>Телефон:</label>
                    <input type="tel" id="clientPhone" placeholder="+7 900 123 45 67" oninput="app.formatPhone(this)">
                </div>
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" id="clientEmail">
                </div>
                <div class="form-group">
                    <label>Примечания:</label>
                    <textarea id="clientNotes"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;

        this.showModal('Добавить клиента', content);

        document.getElementById('addClientForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveClient();
        });
    }

    // Обновляем метод saveClient
    async saveClient() {
        const formData = {
            name: document.getElementById('clientName').value,
            phone: document.getElementById('clientPhone').value,
            email: document.getElementById('clientEmail').value,
            notes: document.getElementById('clientNotes').value
        };

        // Проверяем уникальность телефона
        if (formData.phone) {
            const existingClients = await this.getAllClients();
            const duplicate = existingClients.find(client => client.phone === formData.phone);
            
            if (duplicate) {
                this.showNotification('Клиент с таким телефоном уже существует', 'error');
                return;
            }
        }

        await this.addClient(formData);
        this.hideModal();
        this.loadClients();
    }

    async showSessionDetails(sessionId) {
    try {
        const session = await this.getSession(sessionId);
        const classType = await this.getClassType(session.classType);
        const bookingsCount = await this.getSessionBookingsCount(sessionId); // ЗАГРУЖАЕМ КОЛИЧЕСТВО ЗАПИСЕЙ

        const content = `
        <form id="editSessionForm">
            <input type="hidden" id="editSessionId" value="${session.id}">
             <div class="form-group">
                <label>Дата:</label>
                <input type="date" id="editSessionDate" value="${session.date}" required>
           </div>
           <div class="form-group">
               <label>Время начала:</label>
               <input type="time" id="editSessionTime" value="${session.time}" required>
            </div>
            <div class="form-group">
               <label>Время окончания:</label>
               <input type="time" id="editSessionEndTime" value="${this.calculateEndTime(session.time, classType.duration)}" disabled>
            </div>
            <div class="form-group">
                <label>Тип занятия:</label>
                <select id="editSessionClassType" required></select>
            </div>
            <div class="form-group">
                <label>Тренер:</label>
                <input type="text" id="editSessionTrainer" value="${this.escapeHtml(session.trainer)}" required>
            </div>
            <div class="session-info">
                <h4>Информация о занятии</h4>
                <p>Записано участников: ${bookingsCount}/${classType.maxParticipants}</p>
                ${bookingsCount > 0 ? 
                    '<p class="warning-text">Внимание: на это занятие есть записи. Удаление может вызвать проблемы.</p>' : 
                ''
                }
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-danger" onclick="app.deleteSession(${session.id})">
                    <i class="fas fa-trash"></i> Удалить занятие
                </button>
                <button type="button" class="btn btn-secondary" onclick="app.hideModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">Сохранить изменения</button>
            </div>
        </form>
    `;

        this.showModal('Редактирование занятия', content);

        // Заполняем выпадающий список типов занятий
        this.getAllClassTypes().then(classTypes => {
            const select = document.getElementById('editSessionClassType');
            select.innerHTML = classTypes.map(cls => 
                `<option value="${cls.id}" ${cls.id === session.classType ? 'selected' : ''}>${this.escapeHtml(cls.name)}</option>`
            ).join('');
        });

        document.getElementById('editSessionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateSession();
        });
// Также добавьте обработчик изменения времени начала в showSessionDetails:
document.getElementById('editSessionTime').addEventListener('change', (e) => {
    const selectedClassTypeId = parseInt(document.getElementById('editSessionClassType').value);
    if (selectedClassTypeId) {
        this.getClassType(selectedClassTypeId).then(classType => {
            const endTime = this.calculateEndTime(e.target.value, classType.duration);
            document.getElementById('editSessionEndTime').value = endTime;
        });
    }
});

// И обработчик изменения типа занятия:
document.getElementById('editSessionClassType').addEventListener('change', (e) => {
    const selectedClassTypeId = parseInt(e.target.value);
    const startTime = document.getElementById('editSessionTime').value;
    
    if (selectedClassTypeId && startTime) {
        this.getClassType(selectedClassTypeId).then(classType => {
            const endTime = this.calculateEndTime(startTime, classType.duration);
            document.getElementById('editSessionEndTime').value = endTime;
        });
    }
});

    } catch (error) {
        console.error('Ошибка при загрузке данных занятия:', error);
        this.showNotification('Ошибка при загрузке данных занятия', 'error');
    }
}

    async getSession(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const request = store.get(sessionId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateSession() {
    const sessionId = parseInt(document.getElementById('editSessionId').value);
    const formData = {
        date: document.getElementById('editSessionDate').value,
        time: document.getElementById('editSessionTime').value,
        classType: parseInt(document.getElementById('editSessionClassType').value),
        trainer: document.getElementById('editSessionTrainer').value
        };

    try {
        await this.updateSessionInDB(sessionId, formData);
        this.hideModal();
        this.updateSchedule(); // Обновляем с сортировкой
        this.showNotification('Занятие успешно обновлено', 'success');
        } catch (error) {
        this.showNotification('Ошибка при обновлении занятия', 'error');
        console.error('Ошибка обновления занятия:', error);
        }
    }

    async updateSessionInDB(sessionId, sessionData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            
            // Сначала получаем текущие данные
            const getRequest = store.get(sessionId);
            
            getRequest.onsuccess = () => {
                const existingSession = getRequest.result;
                if (!existingSession) {
                    reject(new Error('Занятие не найдено'));
                    return;
                }

                // Обновляем данные
                const updatedSession = {
                    ...existingSession,
                    ...sessionData
                };

                const putRequest = store.put(updatedSession);
                
                putRequest.onsuccess = () => resolve(putRequest.result);
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteSession(sessionId) {
        // Проверяем есть ли записи на это занятие
        const bookingsCount = await this.getSessionBookingsCount(sessionId);
        
        if (bookingsCount > 0) {
            if (!confirm(`На это занятие записано ${bookingsCount} человек(а). Вы уверены, что хотите удалить его? Это также удалит все связанные записи.`)) {
                return;
            }
            
            // Удаляем связанные записи
            await this.deleteSessionBookings(sessionId);
        } else {
            if (!confirm('Вы уверены, что хотите удалить это занятие?')) {
                return;
            }
        }

        try {
        await this.deleteSessionFromDB(sessionId);
        this.hideModal();
        this.updateSchedule(); // Обновляем с сортировкой
        this.showNotification('Занятие успешно удалено', 'success');
        } catch (error) {
        this.showNotification('Ошибка при удалении занятия', 'error');
        console.error('Ошибка удаления занятия:', error);
            }
        }

    async deleteSessionFromDB(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            const request = store.delete(sessionId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteSessionBookings(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['bookings'], 'readwrite');
            const store = transaction.objectStore('bookings');
            const index = store.index('sessionId');
            const request = index.openCursor(IDBKeyRange.only(sessionId));

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    showNotification(message, type = 'info') {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;
        
        // Стили для уведомления
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 1rem;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Автоматическое скрытие через 3 секунды
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

}

const app = new YogaStudioApp();
