# Code Review — Егерь ИИ

Дата: 2026-05-17

## 🔴 КРИТИЧНО

### 1. CatchModal — коллизия ID при одновременном сохранении
**Файл:** `src/components/CatchModal.jsx`
**Проблема:** `const recId = String(Date.now())` — два сохранения в одну миллисекунду перезапишут друг друга в Firestore.
**Фикс:** Заменить на `doc(collection(...)).id` для генерации уникального ID.

### 2. DiaryScreen — race condition при быстром скролле
**Файл:** `src/screens/DiaryScreen.jsx`
**Проблема:** `loadMore()` может вызываться несколько раз до завершения первого запроса — дублируются записи в UI.
**Фикс:** Флаг `isLoadingMore` — блокировать повторный вызов пока идёт загрузка.

---

## 🟠 ВАЖНО

### 3. CommunityScreen — пустые сообщения проходят редактирование
**Файл:** `src/screens/CommunityScreen.jsx`
**Проблема:** Нет проверки `text.trim()` перед `updateDoc` в режиме редактирования. Пустые сообщения попадают в Firestore.
**Фикс:** Добавить guard `if (!editText.trim()) return;` перед updateDoc.

### 4. CommunityScreen — silent fail при отправке/редактировании
**Файл:** `src/screens/CommunityScreen.jsx`
**Проблема:** `.catch(()=>{})` — пользователь не знает что сообщение не отправилось. Сообщение исчезает без уведомления.
**Фикс:** Показывать тост/ошибку при неудаче, откатывать UI.

### 5. LeaderboardScreen — 500 docs на каждое переключение периода
**Файл:** `src/screens/LeaderboardScreen.jsx`
**Проблема:** `getDocs(..., limit(500))` вызывается без кэша при каждом переключении "месяц/всё время". Лишние Firestore reads + тормоза.
**Фикс:** Кэшировать результат в `useRef` по периоду, не перезагружать если данные уже есть.

---

## 🟡 МИНОРНО

### 6. NewsScreen — потенциальный NaN в дистанции
**Файл:** `src/screens/NewsScreen.jsx`
**Проблема:** `haversine(userLat, userLon, ...)` вызывается без проверки что координаты не null — выводит NaN км.
**Фикс:** Guard `if (!userLat || !userLon) return null` перед вычислением дистанции.

### 7. bot_kb коллекция — проверить Firestore Rules
**Файл:** `functions/index.js`, `firestore.rules`
**Проблема:** Cloud Function пишет в `bot_kb`. Убедиться что Firestore Rules запрещают клиентскую запись в эту коллекцию.
**Фикс:** Добавить явный `allow read, write: if false;` для bot_kb в rules (только CF может писать через Admin SDK).

---

## ✅ Ложные срабатывания (не баги)

- **`return unsub` в useEffect** — корректный паттерн. Firebase unsubscribe — это функция, React вызывает cleanup правильно.
- **Firebase API ключ в `firebase.js`** — публичный клиентский конфиг, так и задумано. Безопасность через Firestore Rules.
- **`functions.config()` fallback** — устарело, но исправлено: теперь ключ в `functions/.env`.
- **`snap.exists` без `()`** — ИСПРАВЛЕНО (9 файлов, 17.05.2026).
