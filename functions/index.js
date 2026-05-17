const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// ────────────────────────────────────────────────────────────
// 1. Триггер на запись улова → проверяем значки
// ────────────────────────────────────────────────────────────
exports.onCatchCreated = functions
  .region("europe-west3")
  .firestore.document("catches/{userId}/records/{recordId}")
  .onCreate(async (snap, context) => {
    const { userId } = context.params;
    const record = snap.data();

    // Загружаем все уловы пользователя
    const allSnap = await db
      .collection("catches").doc(userId).collection("records")
      .get();
    const recs = allSnap.docs.map(d => d.data());

    const badgesRef = db.collection("users").doc(userId).collection("badges");
    const existingSnap = await badgesRef.get();
    const existing = new Set(existingSnap.docs.map(d => d.id));

    const award = async (id) => {
      if (existing.has(id)) return;
      await badgesRef.doc(id).set({ awardedAt: admin.firestore.FieldValue.serverTimestamp() });
      existing.add(id);
      functions.logger.info(`Badge ${id} awarded to ${userId}`);
    };

    // Первый улов
    if (recs.length >= 1) await award("first_catch");

    // 10 записей с фото
    const withPhoto = recs.filter(r => r.photoUrls && r.photoUrls.length > 0);
    if (withPhoto.length >= 10) await award("photographer");

    // Улов > 5 кг
    if (record.weightGrams >= 5000) await award("trophy_5kg");

    // Улов > 15 кг
    if (record.weightGrams >= 15000) await award("whale_15kg");

    // 7 рыбалок за месяц
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = recs.filter(r => {
      const d = r.createdAt ? r.createdAt.toDate() : null;
      return d && d >= monthStart;
    });
    if (thisMonth.length >= 7) await award("weekly_angler");

    // 3 записи до 6:00
    const earlyBird = recs.filter(r => {
      const d = r.createdAt ? r.createdAt.toDate() : null;
      return d && d.getHours() < 6;
    });
    if (earlyBird.length >= 3) await award("early_bird");

    // Записи в 5 разных точках
    const locs = new Set(recs.map(r => r.locationName).filter(Boolean));
    if (locs.size >= 5) await award("traveler");

    // 10 разных видов рыб
    const species = new Set(recs.map(r => r.fishType).filter(Boolean));
    if (species.size >= 10) await award("diversity_10");

    // 10 публичных записей
    const publicRecs = recs.filter(r => r.isPublic);
    if (publicRecs.length >= 10) await award("reporter");
  });


// ────────────────────────────────────────────────────────────
// 2. Еженедельная агрегация рейтинга (воскресенье 20:00 МСК)
// ────────────────────────────────────────────────────────────
exports.aggregateLeaderboard = functions
  .region("europe-west3")
  .pubsub.schedule("0 17 * * 0")       // UTC = воскресенье 17:00 (МСК 20:00)
  .timeZone("UTC")
  .onRun(async () => {
    const periods = {
      week:  new Date(Date.now() - 7  * 24 * 60 * 60 * 1000),
      month: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };

    for (const [period, since] of Object.entries(periods)) {
      const snap = await db.collection("reports")
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(since))
        .get();

      const map = {};
      snap.docs.forEach(d => {
        const r = d.data();
        const uid = r.uid || r.userId || "anon";
        if (!map[uid]) map[uid] = { userId: uid, author: r.displayName || r.author || "Рыбак", catches: 0, totalKg: 0, best: 0 };
        map[uid].catches++;
        const kg = parseFloat(r.weight) || 0;
        map[uid].totalKg += kg;
        if (kg > map[uid].best) map[uid].best = kg;
      });

      const sorted = Object.values(map)
        .sort((a, b) => b.totalKg - a.totalKg || b.catches - a.catches)
        .slice(0, 100);

      const batch = db.batch();
      sorted.forEach((row, i) => {
        const ref = db.collection("leaderboard").doc(period).collection("rows").doc(row.userId);
        batch.set(ref, { ...row, rank: i + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      // Удаляем старые записи за пределами топ-100
      const oldSnap = await db.collection("leaderboard").doc(period).collection("rows").get();
      const topIds = new Set(sorted.map(r => r.userId));
      oldSnap.docs.forEach(d => { if (!topIds.has(d.id)) batch.delete(d.ref); });
      await batch.commit();
      functions.logger.info(`Leaderboard ${period}: ${sorted.length} rows`);
    }
  });


// ────────────────────────────────────────────────────────────
// 3. Обновление метаданных Water Level в header Firestore
//    (каждый час — тригерится через Pub/Sub)
// ────────────────────────────────────────────────────────────
// Уровень воды Дона через Open-Meteo GloFAS (расход → уровень)
// Координаты 47.23,39.72 = русло Дона у Ростова (проверено: даёт ~786 м³/с)
// Конвертация: среднемноголетний расход ~900 м³/с ≈ 0 см, ±15 м³/с ≈ 1 см
async function parsWaterLevel() {
  const url = "https://flood-api.open-meteo.com/v1/flood?latitude=47.23&longitude=39.72&daily=river_discharge&forecast_days=1&past_days=1";
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();

  const discharges = data.daily?.river_discharge || [];
  const discharge = discharges.find(v => v !== null && v > 10);
  if (discharge === undefined || discharge === null) throw new Error("No discharge data");

  // Конвертация в относительный уровень: 900 м³/с = норма = 0 см
  const level = Math.round((discharge - 900) / 15);
  const result = {
    level,
    discharge: Math.round(discharge),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "open-meteo-glofas",
  };

  await db.collection("water_levels").doc("don-rostov").set(result);
  functions.logger.info(`[water] discharge=${Math.round(discharge)} м³/с → level=${level} см`);
  return { level, discharge: Math.round(discharge) };
}

exports.fetchWaterLevel = functions
  .region("europe-west3")
  .pubsub.schedule("0 * * * *")
  .timeZone("Europe/Moscow")
  .onRun(async () => { try { await parsWaterLevel(); } catch(e) { functions.logger.error("[water]", e.message); } });

// HTTP-триггер для ручного теста: GET https://.../triggerFetchWaterLevel
exports.triggerFetchWaterLevel = functions
  .region("europe-west3")
  .https.onRequest(async (req, res) => {
    try {
      const result = await parsWaterLevel();
      res.json({ ok: true, ...result });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });


// ────────────────────────────────────────────────────────────
// 4. Антиспам FCM — не больше 3 пушей в неделю на пользователя
// ────────────────────────────────────────────────────────────
exports.sendPushWithRateLimit = functions
  .region("europe-west3")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");

    const { title, body, url } = data;
    if (!title || !body) throw new functions.https.HttpsError("invalid-argument", "title and body required");

    // Проверяем лимит
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logRef = db.collection("push_log").doc(context.auth.uid);
    const logDoc = await logRef.get();
    const sentThisWeek = logDoc.exists
      ? (logDoc.data().sent || []).filter(ts => ts.toDate() >= weekAgo)
      : [];

    if (sentThisWeek.length >= 3) {
      functions.logger.info(`Rate limit hit for ${context.auth.uid}`);
      return { limited: true };
    }

    // Отправляем
    const tokensSnap = await db.collection("fcm_tokens").get();
    const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
    if (tokens.length === 0) return { sent: 0 };

    const msg = {
      notification: { title, body },
      data: { url: url || "https://eger-ai.app/" },
      tokens,
    };

    const resp = await admin.messaging().sendEachForMulticast(msg);
    functions.logger.info(`Push sent: ${resp.successCount}/${tokens.length}`);

    // Логируем
    await logRef.set({
      sent: [...sentThisWeek, admin.firestore.FieldValue.serverTimestamp()],
    }, { merge: true });

    return { sent: resp.successCount, failed: resp.failureCount };
  });


// ────────────────────────────────────────────────────────────
// 5. Уведомление "поймали рядом" — когда публикуется отчёт
// ────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p, dLon = (lon2 - lon1) * p;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

exports.notifyNearbyCatch = functions
  .region("europe-west3")
  .firestore.document("reports/{reportId}")
  .onCreate(async (snap, context) => {
    const report = snap.data();
    if (!report.lat || !report.lng) return null;

    // Найти пользователей в радиусе 15 км у которых есть FCM токен
    const usersSnap = await db.collection("users").get();
    const nearbyUids = usersSnap.docs
      .filter(d => {
        const u = d.data();
        return u.lat && u.lng
          && d.id !== (report.userId || "")
          && haversineKm(report.lat, report.lng, u.lat, u.lng) <= 15;
      })
      .map(d => d.id);

    if (nearbyUids.length === 0) return null;

    // Собираем токены ближайших пользователей
    const tokensSnap = await db.collection("fcm_tokens").get();
    // Токены не привязаны к uid напрямую, поэтому отправляем им через broadcast
    // Только если кто-то из nearby зарегистрировал токен в эту сессию
    // Это упрощённый вариант — в продакшне лучше хранить {uid, token}
    const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
    if (tokens.length === 0) return null;

    const title = "🐟 Поймали рядом!";
    const body = `${report.author || "Рыбак"}: ${report.fish || "улов"} ${report.weight ? report.weight + " кг" : ""} в ${Math.round(haversineKm(report.lat, report.lng, report.lat, report.lng))} км`;

    // Отправляем только если есть поблизости юзеры
    functions.logger.info(`notifyNearbyCatch: ${nearbyUids.length} nearby users, ${tokens.length} tokens`);

    const msg = {
      notification: { title, body: `${report.author || "Рыбак"}: ${report.fish || "улов"} ${report.weight ? report.weight + " кг" : ""}` },
      data: { url: "https://eger-ai.app/", type: "nearby_catch" },
      tokens: tokens.slice(0, 500),
    };

    const resp = await admin.messaging().sendEachForMulticast(msg);
    functions.logger.info(`notifyNearbyCatch sent: ${resp.successCount}/${tokens.length}`);
    return null;
  });


// ────────────────────────────────────────────────────────────
// 6. Пятничный прогноз клёва на выходные (пятница 17:00 МСК = 14:00 UTC)
// ────────────────────────────────────────────────────────────
exports.pushWeekendForecast = functions
  .region("europe-west3")
  .pubsub.schedule("0 14 * * 5")
  .timeZone("UTC")
  .onRun(async () => {
    const tokensSnap = await db.collection("fcm_tokens").get();
    const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
    if (tokens.length === 0) return null;

    // Простая оценка клёва по сезону
    const month = new Date().getMonth() + 1;
    const goodMonths = [4, 5, 6, 9, 10];
    const biteText = goodMonths.includes(month)
      ? "Отличный клёв ожидается — самое время выехать!"
      : "Клёв средний, но рыбалка всё равно зовёт 🎣";

    const msg = {
      notification: { title: "🎣 Прогноз на выходные", body: biteText },
      data: { url: "https://eger-ai.app/", type: "weekend_forecast" },
      tokens: tokens.slice(0, 500),
    };
    const r = await admin.messaging().sendEachForMulticast(msg);
    functions.logger.info(`pushWeekendForecast: ${r.successCount}/${tokens.length}`);
    return null;
  });


// ────────────────────────────────────────────────────────────
// 7. Напоминание рыбакам, не логировавшим улов 5+ дней (вторник 9:00 МСК = 6:00 UTC)
// ────────────────────────────────────────────────────────────
exports.pushFishingReminder = functions
  .region("europe-west3")
  .pubsub.schedule("0 6 * * 2")
  .timeZone("UTC")
  .onRun(async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const usersSnap = await db.collection("users").get();
    const inactiveUids = [];

    for (const doc of usersSnap.docs) {
      const uid = doc.id;
      const recentSnap = await db.collection("catches").doc(uid).collection("records")
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(fiveDaysAgo))
        .limit(1).get();
      if (recentSnap.empty) inactiveUids.push(uid);
    }

    if (inactiveUids.length === 0) return null;
    functions.logger.info(`pushFishingReminder: ${inactiveUids.length} inactive users`);

    // Берём все FCM токены (упрощённо — без привязки к uid)
    const tokensSnap = await db.collection("fcm_tokens").get();
    const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
    if (tokens.length === 0) return null;

    const msg = {
      notification: {
        title: "🎣 Давно не рыбачили?",
        body: "Самое время записать новый улов или проверить прогноз клёва!"
      },
      data: { url: "https://eger-ai.app/", type: "fishing_reminder" },
      tokens: tokens.slice(0, 500),
    };
    const r = await admin.messaging().sendEachForMulticast(msg);
    functions.logger.info(`pushFishingReminder sent: ${r.successCount}/${tokens.length}`);
    return null;
  });


// ────────────────────────────────────────────────────────────
// 8. Награждение значком explorer при одобрении предложенной точки
// ────────────────────────────────────────────────────────────
exports.onSpotApproved = functions
  .region("europe-west3")
  .firestore.document("suggested_spots/{spotId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === "approved" || after.status !== "approved") return null;
    const userId = after.uid || after.userId;
    if (!userId) return null;
    const badgeRef = db.collection("users").doc(userId).collection("badges").doc("explorer");
    const badge = await badgeRef.get();
    if (badge.exists) return null;
    await badgeRef.set({ awardedAt: admin.firestore.FieldValue.serverTimestamp() });
    functions.logger.info(`Badge explorer awarded to ${userId} for spot ${context.params.spotId}`);
    return null;
  });


// ────────────────────────────────────────────────────────────
// 9. Егерь ИИ — Claude AI агент (Anthropic claude-haiku)
// ────────────────────────────────────────────────────────────
exports.askEger = onCall(
  { region: "europe-west3", timeoutSeconds: 60, memory: "256MiB", cors: true },
  async (request) => {
    const { messages = [], weather, userCatches = [], mode } = request.data;

    // home_advice кешируется клиентом (sessionStorage), лимит не применяем
    const isHomeAdvice = mode === "home_advice";

    // Rate limit: авторизованные 30/день, гости 10/день
    const uid = request.auth?.uid;
    const ip = (request.rawRequest?.headers?.["x-forwarded-for"] || request.rawRequest?.ip || "unknown")
      .split(",")[0].trim().replace(/[.:]/g, "_");
    const limitKey = uid || `ip_${ip}`;
    const dailyLimit = uid ? 30 : 10;

    const today = new Date().toISOString().split("T")[0];
    const usageRef = db.collection("ai_usage").doc(limitKey);
    const usageDoc = await usageRef.get();
    const usageData = usageDoc.exists ? usageDoc.data() : {};
    const todayCount = usageData.date === today ? (usageData.count || 0) : 0;

    if (!isHomeAdvice && todayCount >= dailyLimit) {
      const msg = uid
        ? `Лимит ${dailyLimit} сообщений в день исчерпан 🎣 Возвращайся завтра!`
        : `Лимит ${dailyLimit} сообщений в день для гостей исчерпан 🎣 Войди в аккаунт — там больше!`;
      return { limited: true, message: msg };
    }

    // Контекстная информация для системного промпта
    let weatherCtx = "Данные погоды недоступны.";
    if (weather) {
      weatherCtx = `Текущая погода: ${weather.temp ?? "?"}°C, ветер ${weather.wind ?? "?"} м/с, давление ${weather.pressure ?? "?"} мм.рт.ст., температура воды ~${weather.waterTemp ?? "?"}°C.`;
    }
    let catchesCtx = "История уловов пуста.";
    if (userCatches.length > 0) {
      catchesCtx = "Последние уловы пользователя: " + userCatches
        .map(c => `${c.fishType || "рыба"} ${c.weightGrams ? (c.weightGrams / 1000).toFixed(1) + " кг" : ""} ${c.locationName ? "на " + c.locationName : ""}`.trim())
        .join("; ") + ".";
    }

    const systemPrompt = `Ты — Егерь ИИ, опытный рыбак и персональный советник по рыбалке в Ростовской области России.
Ты знаешь каждый омут и перекат реки Дон, Цимлянского водохранилища, озера Маныч, Азовского моря и малых рек области.

Отвечай на русском языке. Тон: дружелюбный, практичный, с лёгким юмором рыбака. Давай конкретные и полезные советы.

Области экспертизы:
- Рыбные места: Дон, Цимлянское вдхр, Маныч, Азовское море, реки Аксай, Кагальник, Сал, Северский Донец
- Рыбы: судак, щука, сом, лещ, карп, сазан, тарань, окунь, чехонь, белый амур, голавль, жерех, синец, берш
- Снасти: фидер, спиннинг, поплавочная, нахлыст, карповая рыбалка, зимняя рыбалка, донка
- Влияние давления, ветра, луны, температуры воды и сезона на клёв
- Прикормки, насадки, монтажи, техники проводки

${weatherCtx}
${catchesCtx}

Отвечай кратко — 2–3 абзаца максимум. Используй эмодзи умеренно (1–2 на ответ). Не начинай каждый ответ одинаково. Если вопрос выходит за пределы рыбалки — мягко верни тему к рыбалке.`;

    // Подготовка истории диалога для Claude
    const rawMessages = messages
      .filter(m => m.content && m.role)
      .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000) }));

    // Сообщения должны начинаться с user и чередоваться
    while (rawMessages.length > 0 && rawMessages[0].role !== "user") rawMessages.shift();
    const anthropicMessages = [];
    for (const m of rawMessages) {
      if (anthropicMessages.length === 0 || anthropicMessages[anthropicMessages.length - 1].role !== m.role) {
        anthropicMessages.push(m);
      } else {
        anthropicMessages[anthropicMessages.length - 1].content += "\n" + m.content;
      }
    }
    if (anthropicMessages.length === 0) throw new HttpsError("invalid-argument", "No messages");

    // API key: сначала env (Functions v2), потом config (Functions v1)
    const apiKey = process.env.ANTHROPIC_API_KEY || functions.config().anthropic?.api_key;
    if (!apiKey) {
      functions.logger.error("ANTHROPIC_API_KEY not configured");
      throw new HttpsError("internal", "AI не настроен — обратитесь к администратору");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      functions.logger.error("Anthropic API error:", response.status, errText);
      throw new HttpsError("internal", "Сервис ИИ временно недоступен");
    }

    const result = await response.json();
    const replyText = result.content?.[0]?.text || "Не смог ответить, попробуй ещё раз 🎣";

    // Обновляем счётчик (home_advice не считается)
    if (!isHomeAdvice) await usageRef.set({ date: today, count: todayCount + 1 }, { merge: true });

    functions.logger.info(`askEger uid=${request.auth?.uid || "anon"} in=${result.usage?.input_tokens} out=${result.usage?.output_tokens}`);

    // Сохраняем Q&A в базу знаний для обучения встроенного бота (fire-and-forget)
    const lastUserMsg = anthropicMessages[anthropicMessages.length - 1]?.content || "";
    db.collection("bot_kb").add({
      question: String(lastUserMsg).slice(0, 500),
      answer: replyText,
      keywords: extractKeywords(String(lastUserMsg)),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }).then(() => {
      // Изредка чистим старые записи (вероятность 2%)
      if (Math.random() < 0.02) {
        db.collection("bot_kb").orderBy("timestamp", "asc").get().then(snap => {
          if (snap.size > 500) {
            const b = db.batch();
            snap.docs.slice(0, snap.size - 500).forEach(d => b.delete(d.ref));
            b.commit();
          }
        }).catch(() => {});
      }
    }).catch(e => functions.logger.warn("bot_kb save:", e.message));

    return { text: replyText };
  });


// ────────────────────────────────────────────────────────────
// 10. Автообновление ленты новостей о рыбалке (Google News RSS)
// ────────────────────────────────────────────────────────────

const KW_STOPWORDS = new Set([
  'что','как','где','когда','какой','какая','какие','это','для','при','или','но',
  'по','на','в','из','с','и','а','не','мне','меня','есть','там','тут','его','её',
  'их','он','она','они','мы','вы','ты','я','был','была','было','будет','можно',
  'нужно','надо','хочу','хочет','должен','очень','уже','ещё','тоже','также',
  'если','то','так','всё','всех','всем','этот','этой','этим',
]);
function extractKeywords(text) {
  return [...new Set(
    text.toLowerCase().replace(/[^\wа-яё\s]/gi, " ").split(/\s+/)
      .filter(w => w.length > 3 && !KW_STOPWORDS.has(w))
  )].slice(0, 25);
}

function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ")
    .replace(/\s+/g," ").trim();
}

function parseRssItems(xml) {
  const items = [], rx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const b = m[1];
    const g = tag => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
      return (b.match(r)?.[1] || "").trim();
    };
    const title = stripHtml(g("title"));
    if (!title || title.length < 10) continue;
    const link = g("link").replace(/\s/g, "");
    const desc  = stripHtml(g("description")).slice(0, 300);
    const source = stripHtml(b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "").trim() || "Новости";
    items.push({ title, link, desc, source });
  }
  return items;
}

function newsTag(title, desc) {
  const t = (title + " " + desc).toLowerCase();
  if (/запрет|нерест|браконьер|штраф|нельзя|ограничен/.test(t)) return "Запрет";
  if (/уровень воды|паводок|половодье|гидрол|сброс|разлив/.test(t)) return "Гидрология";
  if (/постановлени|приказ|министерств|росрыбол|минприрод|официальн|закон/.test(t)) return "Официально";
  if (/соревнован|чемпионат|турнир|кубок|спортивн/.test(t)) return "Соревнования";
  if (/клёв|клев|ловится|поймали|улов|рыбачи|хороший/.test(t)) return "Клёв";
  return "Аналитика";
}

const REGION_COORDS = [
  ["ростов",         47.2357, 39.7015],
  ["аксай",          47.2681, 39.8699],
  ["азов",           47.1023, 39.4123],
  ["таганрог",       47.2090, 38.9360],
  ["новочеркасск",   47.4181, 40.0956],
  ["батайск",        47.1456, 39.7456],
  ["цимлянск",       47.6421, 42.0954],
  ["волгодонск",     47.5134, 42.1523],
  ["шахты",          47.7089, 40.2156],
  ["семикаракорск",  47.5101, 40.8234],
  ["константиновск", 47.5801, 41.0912],
  ["белая калитва",  48.1789, 40.7734],
  ["пролетарск",     46.7012, 41.7234],
  ["сальск",         46.4739, 41.5388],
];

function newsCoords(text) {
  const t = text.toLowerCase();
  for (const [city, lat, lng] of REGION_COORDS) {
    if (t.includes(city)) return { lat, lng };
  }
  return { lat: 47.2357, lng: 39.7015 };
}

function newsId(title) {
  let h = 5381;
  for (const c of title) h = (((h << 5) + h) ^ c.charCodeAt(0)) >>> 0;
  return "n" + h.toString(36);
}

const GOOGLE = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=RU&ceid=RU:ru`;
const YANDEX = (q, lr = 39) => `https://news.yandex.ru/search.rss?text=${encodeURIComponent(q)}&lr=${lr}`;

const NEWS_SOURCES = [
  // ── Google News ───────────────────────────────────────────────
  { url: GOOGLE("рыбалка Дон Ростов клёв улов рыболов"),                    src: "Google Новости" },
  { url: GOOGLE("запрет нерест рыбалка Ростовская область 2026"),            src: "Google Новости" },
  { url: GOOGLE("уровень воды Дон Ростов паводок гидрология"),               src: "Google Новости" },
  { url: GOOGLE("рыбнадзор Росрыболовство Ростовская область новости"),      src: "Google Новости" },
  { url: GOOGLE("рыбалка Цимлянское водохранилище улов 2026"),               src: "Google Новости" },
  { url: GOOGLE("рыбалка Азовское море 2026 рыболов Ростов"),                src: "Google Новости" },
  { url: GOOGLE("рыболовство Дон весна 2026 клёв судак лещ"),                src: "Google Новости" },
  { url: GOOGLE("браконьерство Дон Ростовская область рыбоохрана"),          src: "Google Новости" },
  // ── Яндекс Новости (lr=39 — Ростовская область) ──────────────
  { url: YANDEX("рыбалка Ростов Дон улов клёв"),                            src: "Яндекс Новости" },
  { url: YANDEX("рыболовство нерест запрет Ростовская область"),            src: "Яндекс Новости" },
  { url: YANDEX("браконьер рыбнадзор Дон Ростов"),                         src: "Яндекс Новости" },
  { url: YANDEX("уровень воды Дон половодье паводок"),                      src: "Яндекс Новости" },
  { url: YANDEX("рыбалка Цимлянское водохранилище"),                        src: "Яндекс Новости" },
];

async function doFetchNews() {
  // Параллельно запрашиваем все источники
  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async ({ url, src }) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(14000), headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const items = parseRssItems(xml).map(it => ({ ...it, source: it.source || src }));
      functions.logger.info(`RSS [${src}] "${url.slice(-50)}" → ${items.length}`);
      return items;
    })
  );

  const raw = [];
  for (const r of results) {
    if (r.status === "fulfilled") raw.push(...r.value);
    else functions.logger.warn("RSS source failed:", r.reason?.message);
  }

  // Deduplicate by id
  const seen = new Set(), unique = [];
  for (const it of raw) {
    const id = newsId(it.title);
    if (!seen.has(id)) { seen.add(id); unique.push({ ...it, id }); }
  }

  // Compare with existing Firestore ids
  const existingSnap = await db.collection("news").select().get();
  const existingIds = new Set(existingSnap.docs.map(d => d.id));
  const toAdd = unique.filter(it => !existingIds.has(it.id));

  if (toAdd.length === 0) {
    functions.logger.info("fetchFishingNews: no new items");
    return 0;
  }

  const batch = db.batch();
  for (const it of toAdd) {
    const coords = newsCoords(it.title + " " + it.desc);
    batch.set(db.collection("news").doc(it.id), {
      title: it.title,
      text: it.desc,
      source: it.source,
      link: it.link || "",
      tag: newsTag(it.title, it.desc),
      lat: coords.lat,
      lng: coords.lng,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  functions.logger.info(`fetchFishingNews: +${toAdd.length} items`);

  // Prune oldest beyond 120
  const allSnap = await db.collection("news").orderBy("timestamp", "asc").get();
  if (allSnap.size > 120) {
    const pruneSnap = allSnap.docs.slice(0, allSnap.size - 120);
    const pb = db.batch();
    pruneSnap.forEach(d => pb.delete(d.ref));
    await pb.commit();
    functions.logger.info(`fetchFishingNews: pruned ${pruneSnap.length} old items`);
  }

  return toAdd.length;
}

exports.fetchFishingNews = functions
  .region("europe-west3")
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("*/20 * * * *")
  .timeZone("UTC")
  .onRun(async () => { await doFetchNews(); return null; });

// Ручной запуск для любого авторизованного (cooldown 30 мин)
exports.triggerFetchNews = functions
  .region("europe-west3")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
    const metaRef = db.collection("_meta").doc("news_fetch");
    const meta = await metaRef.get();
    if (meta.exists) {
      const last = meta.data().lastFetch?.toDate();
      if (last && Date.now() - last.getTime() < 5 * 60 * 1000) {
        return { skipped: true, message: "Обновление было менее 5 минут назад" };
      }
    }
    const added = await doFetchNews();
    await metaRef.set({ lastFetch: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { added };
  });

// ────────────────────────────────────────────────────────────
// 12. Боты-рыбаки — симуляция активности пользователей
// ────────────────────────────────────────────────────────────

const BOTS = [
  { uid:"bot_001", name:"Алексей Донской",      username:"alexey_don",    area:"Дон у Ростова",    lat:47.2357, lng:39.7015, fish:["судак","щука","окунь"],         method:"спиннинг",      bait:"джиг-головка, виброхвост",   emoji:"🎣" },
  { uid:"bot_002", name:"Михаил Аксайский",     username:"misha_aksay",   area:"Аксай",            lat:47.2681, lng:39.8699, fish:["лещ","сазан","карась"],          method:"фидер",         bait:"опарыш, кукуруза",           emoji:"🐟" },
  { uid:"bot_003", name:"Сергей Цимлянский",    username:"ser_tsimla",    area:"Цимлянское вдхр",  lat:47.6421, lng:42.0954, fish:["карп","сазан","лещ"],            method:"карповая",      bait:"бойлы, пелlets",             emoji:"🏆" },
  { uid:"bot_004", name:"Дмитрий Азовский",     username:"dima_azov",     area:"Азовское море",    lat:47.1023, lng:39.4123, fish:["судак","пиленгас","бычок"],      method:"донка",         bait:"червь, мидия",               emoji:"⚓" },
  { uid:"bot_005", name:"Николай Батайский",    username:"kolya_bataysk", area:"Батайск, р.Дон",   lat:47.1456, lng:39.7456, fish:["карась","плотва","красноперка"], method:"поплавок",      bait:"хлеб, опарыш",               emoji:"🌅" },
  { uid:"bot_006", name:"Андрей Новочерк",      username:"andrey_nch",    area:"Новочеркасск",     lat:47.4181, lng:40.0956, fish:["судак","берш","голавль"],        method:"джиг",          bait:"поролон, виброхвост",        emoji:"💪" },
  { uid:"bot_007", name:"Василий Таганрогский", username:"vasya_tag",     area:"Таганрог",         lat:47.2090, lng:38.9360, fish:["бычок","кефаль","пиленгас"],    method:"морской фидер", bait:"мидия, кальмар",             emoji:"🌊" },
  { uid:"bot_008", name:"Иван Семикаракорский", username:"vanya_semi",    area:"Семикаракорск",    lat:47.5101, lng:40.8234, fish:["лещ","синец","густера"],         method:"фидер",         bait:"перловка, кукуруза",         emoji:"🎯" },
  { uid:"bot_009", name:"Пётр Волгодонской",    username:"petr_vd",       area:"Волгодонск",       lat:47.5134, lng:42.1523, fish:["судак","лещ","карп"],            method:"спиннинг",      bait:"воблер, джиг",               emoji:"🔥" },
  { uid:"bot_010", name:"Фёдор Константин",     username:"fedor_const",   area:"Константиновск",   lat:47.5801, lng:41.0912, fish:["голавль","жерех","чехонь"],      method:"нахлыст",       bait:"сухая мушка, стример",       emoji:"🎩" },
];

// Fishing photos pool — cached by lock seed
const PHOTO_POOL = Array.from({ length: 24 }, (_, i) =>
  `https://loremflickr.com/640/480/fishing,fish,catch?lock=${i + 1}`
);

const BOTS_BY_UID = Object.fromEntries(BOTS.map(b => [b.uid, b]));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const rnd  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function botFish(b) { return pick(b.fish); }

// ── Самостоятельное сообщение в чат ──────────────────────────
function genChatMsg(b) {
  const fish = botFish(b);
  const weight = (rnd(3, 38) / 10).toFixed(1);
  const msgs = [
    `Привет всем! Только вернулся с ${b.area} — взял ${fish} на ${b.method}. Клёв утром был отличный! ${b.emoji}`,
    `Сегодня на ${b.area}: ${fish} ${weight} кг на ${b.method}. ${pick(["Счастливое место!","Снова повезло!","Отличная рыбалка!"])} ${b.emoji}`,
    `Кто собирается на ${b.area} на выходных? Там сейчас ${pick(["хорошо клюёт","активный клёв","рыба стоит"])} ${b.emoji}`,
    `Ловлю на ${b.method} в районе ${b.area}. ${pick(["Рекомендую всем","Отличное место","Советую заехать"])} — ${fish} берёт уверенно 🎣`,
    `${b.emoji} ${fish} сегодня на ${b.area} попадался хорошо. Брал на ${b.bait}, глубина ${rnd(2, 6)} м.`,
    `Утром на ${b.area}: ${fish} ${weight} кг! Снасть — ${b.method}, насадка — ${b.bait}. Всем советую! ${b.emoji}`,
    `Стоит ехать на ${b.area} в эти выходные? Планирую за ${fish}ем на ${b.method}. ${b.emoji}`,
    `${b.emoji} Только вернулся — ${b.area}, ${fish} на ${b.method}. ${pick(["Рыбалка удалась!","Отличный день!","Не зря поехал!","Доволен полностью!"])}`,
    `Поделюсь наблюдением: ${fish} на ${b.area} сейчас активнее клюёт в ${pick(["утренние","вечерние"])} часы. Проверено лично ${b.emoji}`,
    `Вопрос знатокам: как ${fish} реагирует на ${pick(["перемену давления","ветер","похолодание","жару"])}? На ${b.area} заметил интересное поведение.`,
    `${b.emoji} Сезон в самом разгаре! На ${b.area} сегодня отличный клёв. ${fish} берёт на ${b.bait} — попробуйте!`,
    `На ${b.area} вчера ходил — ${fish} активный, поклёвки каждые ${rnd(10, 40)} минут. Вода ${rnd(15, 23)}°C. ${b.emoji}`,
    `Погода сейчас идеальная для ${b.method}. Еду сегодня на ${b.area} за ${fish}ем, пожелайте удачи! ${b.emoji}`,
    `${b.emoji} Поймал сегодня на ${b.area} ${fish} ${weight} кг — личный рекорд для этого места! Снасть: ${b.method}, насадка: ${b.bait}.`,
  ];
  return pick(msgs);
}

// ── Ответ одного бота другому ─────────────────────────────────
function genReplyMsg(me, target) {
  const myFish = botFish(me);
  const replies = [
    `@${target.username} Отлично! Сам на ${me.area} недавно был — ${myFish} тоже брал хорошо ${me.emoji}`,
    `@${target.username} Интересно! А на что конкретно брал? У меня ${me.method} там хорошо работает.`,
    `@${target.username} Поддержу! На ${me.area} тоже советую заехать — рыба есть ${me.emoji}`,
    `@${target.username} Как глубина там сейчас? Планирую заехать, хочу понять где вставать.`,
    `@${target.username} Согласен насчёт клёва — давление сейчас хорошее, рыба активна 🎣`,
    `@${target.username} Попробуй ${me.bait} — мне на ${me.area} всегда выручает! ${me.emoji}`,
    `@${target.username} Красавчик! Какой монтаж ставил? Поделись опытом ${me.emoji}`,
    `@${target.username} Отличный результат 👍 Я на ${me.area} вчера тоже неплохо отловился, ${myFish} активный был.`,
    `@${target.username} С берега ловил или с лодки? Хочу тоже туда выбраться на этой неделе.`,
    `@${target.username} Ого! У меня вот на ${me.area} сейчас тихо — завидую ${me.emoji}`,
    `@${target.username} Слышал про это место — говорят там всегда хорошо. Ты часто туда ездишь?`,
    `@${target.username} Хороший выбор снасти! На ${me.area} тоже ${me.method} сейчас актуален ${me.emoji}`,
    `@${target.username} Вода уже потеплела в тех краях? Жду когда ${myFish} активнее пойдёт.`,
    `@${target.username} Молодец! Я на прошлой неделе на ${me.area} брал ${myFish} на ${me.bait} — попробуй, вдруг зайдёт!`,
    `@${target.username} Хорошее место! Я там пробовал — ${myFish} хорошо берёт у ${pick(["правого берега","левого берега","поворота","островка"])} ${me.emoji}`,
  ];
  return pick(replies);
}

// ── Полный отчёт с фото и данными ────────────────────────────
function genReport(b) {
  const fish1 = botFish(b);
  const fish2 = botFish(b);
  const w1 = (rnd(6, 48) / 10).toFixed(1);
  const w2 = (rnd(2, 20) / 10).toFixed(1);
  const count = rnd(2, 10);
  const totalKg = (count * rnd(2, 15) / 10).toFixed(1);
  const hour = rnd(4, 8);
  const depth = rnd(2, 8);
  const temp = rnd(13, 23);
  const weather = pick(["ясно, штиль", "переменная облачность, слабый ветер", "пасмурно, тихо", "солнечно, ветер 3 м/с"]);
  const photoUrl = pick(PHOTO_POOL);

  const titles = [
    `${b.emoji} Рыбалка на ${b.area} — ${fish1} на ${b.method}`,
    `Отчёт: ${fish1} ${w1} кг, ${b.area}`,
    `Утренняя смена — ${b.area}, ${fish1} и ${fish2}`,
    `${b.emoji} Хороший улов! ${b.area}`,
    `${fish1} и ${fish2} на ${b.area} — отчёт`,
    `${b.method.charAt(0).toUpperCase() + b.method.slice(1)} на ${b.area}: итоги`,
  ];

  const bodies = [
    `Выехал в ${hour}:00, встал на проверенном месте. Ловил на ${b.method}, глубина ${depth} м, насадка — ${b.bait}. Первый ${fish1} взял через 30 минут — ${w1} кг. Поклёвки шли регулярно. Итого: ${count} рыбин общим весом ${totalKg} кг. Вода ${temp}°C, погода: ${weather}. Место отличное, всем рекомендую! ${b.emoji}`,
    `Давно не был на ${b.area}, наконец выбрался. Погода ${pick(["порадовала","была идеальная","не подвела"])} — ${weather}. ${fish1} брал активно с ${hour}:00 до ${hour + 2}:00. Лучший ${fish1} — ${w1} кг. ${fish2} тоже попался, ${w2} кг — приятный бонус! Снасть: ${b.method}, насадка: ${b.bait}, глубина ${depth} м. Итого ${count} хвостов (${totalKg} кг). Советую всем! ${b.emoji}`,
    `Отличная смена! ${b.area}, ${b.method}, насадка ${b.bait}. Глубина ${depth} м, температура воды ${temp}°C, ${weather}. Поклёвки начались с рассвета. ${fish1} взял ${w1} кг — лучший за последние месяцы! ${fish2} тоже присутствовал — ${w2} кг. Всего ${count} рыбин суммарно ${totalKg} кг. ${b.emoji} Место буду охранять!`,
    `Прекрасное утро на ${b.area}! Стартовал в ${hour}:30, вода чистая, течение ${pick(["слабое","умеренное","почти нет"])}. Работал ${b.method} с ${b.bait}. ${fish1} активничал — ${count} поклёвок, реализовал ${Math.max(1, count - rnd(1, 2))}. Самый крупный ${w1} кг. Общий улов ${totalKg} кг. Погода: ${weather}. Вернусь сюда! ${b.emoji}`,
  ];

  return {
    title: pick(titles),
    body: pick(bodies),
    location: b.area,
    fish: fish1 !== fish2 ? `${fish1}, ${fish2}` : fish1,
    weight: totalKg,
    method: b.method,
    bait: b.bait,
    depth,
    waterTemp: temp,
    totalCount: count,
    uid: b.uid,
    userId: b.uid,
    author: b.name,
    displayName: b.name,
    photo_url: photoUrl,
    photoUrls: [photoUrl],
    lat: b.lat + (Math.random() - 0.5) * 0.05,
    lng: b.lng + (Math.random() - 0.5) * 0.05,
    isBot: true,
  };
}

function genCatch(b) {
  const fish = botFish(b);
  const weightGrams = rnd(150, 5500);
  const withPhoto = Math.random() < 0.4;
  return {
    fishType: fish,
    fishName: fish,
    weightGrams,
    lengthCm: rnd(18, 78),
    locationName: b.area,
    method: b.method,
    bait: b.bait,
    depthM: rnd(2, 8),
    lat: b.lat + (Math.random() - 0.5) * 0.05,
    lng: b.lng + (Math.random() - 0.5) * 0.05,
    isPublic: true,
    ...(withPhoto ? { photoUrls: [pick(PHOTO_POOL)] } : {}),
  };
}

async function ensureBotProfiles() {
  for (const b of BOTS) {
    const ref = db.collection("users").doc(b.uid);
    const snap = await ref.get();
    const photoURL = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(b.name)}`;
    if (!snap.exists) {
      await ref.set({
        displayName: b.name,
        username: b.username,
        photoURL,
        area: b.area,
        method: b.method,
        isBot: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (!snap.data().username) {
      await ref.update({ username: b.username, photoURL });
    }
  }
}

async function runBotsOnce() {
  await ensureBotProfiles();
  const ts = admin.firestore.FieldValue.serverTimestamp();

  // Читаем последние 20 сообщений для диалога
  const recentMsgsSnap = await db.collection("messages")
    .orderBy("timestamp", "desc").limit(20).get();
  const recentBotMsgs = recentMsgsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.isBot && m.uid && BOTS_BY_UID[m.uid]);

  // Читаем последние отчёты для лайков
  const recentReportsSnap = await db.collection("reports")
    .orderBy("timestamp", "desc").limit(20).get();
  const recentReports = recentReportsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.isBot);

  const shuffled = [...BOTS].sort(() => Math.random() - 0.5);
  const active = shuffled.slice(0, rnd(3, 5)); // 3-5 ботов за раз
  let actions = 0;

  for (const b of active) {
    // Взвешенный выбор: reply 30%, chat 40%, report 22%, catch 8%
    const roll = Math.random();
    let action;
    if (roll < 0.30) action = "reply";
    else if (roll < 0.70) action = "chat";
    else if (roll < 0.92) action = "report";
    else action = "catch";

    if (action === "reply") {
      const candidates = recentBotMsgs.filter(m => m.uid !== b.uid);
      const targetMsg = candidates.length > 0 ? pick(candidates) : null;
      const targetBot = targetMsg ? BOTS_BY_UID[targetMsg.uid] : null;
      const text = targetBot ? genReplyMsg(b, targetBot) : genChatMsg(b);
      await db.collection("messages").add({
        uid: b.uid,
        displayName: b.name,
        username: b.username,
        text,
        timestamp: ts,
        isBot: true,
      });
      functions.logger.info(`Bot ${b.name} → ${targetBot ? "reply to " + targetBot.name : "chat"}`);
      actions++;
    }

    if (action === "chat") {
      await db.collection("messages").add({
        uid: b.uid,
        displayName: b.name,
        username: b.username,
        text: genChatMsg(b),
        timestamp: ts,
        isBot: true,
      });
      functions.logger.info(`Bot ${b.name} → chat`);
      actions++;
    }

    if (action === "report") {
      const rep = genReport(b);
      await db.collection("reports").add({ ...rep, timestamp: ts });
      functions.logger.info(`Bot ${b.name} → report: ${rep.fish} ${rep.weight}кг`);
      actions++;
    }

    if (action === "catch") {
      const ct = genCatch(b);
      await db.collection("catches").doc(b.uid)
        .collection("records").add({ ...ct, userId: b.uid, createdAt: ts });
      functions.logger.info(`Bot ${b.name} → catch ${ct.fishType} ${ct.weightGrams}g`);
      actions++;
    }

    // 30% шанс лайкнуть чужой отчёт
    if (Math.random() < 0.30 && recentReports.length > 0) {
      const others = recentReports.filter(r => r.uid !== b.uid);
      const target = others.length > 0 ? pick(others) : null;
      if (target) {
        await db.collection("reports").doc(target.id).update({
          likes: admin.firestore.FieldValue.arrayUnion(b.uid),
        }).catch(() => {});
        functions.logger.info(`Bot ${b.name} → liked report ${target.id}`);
      }
    }
  }

  functions.logger.info(`runBots: ${actions} actions by ${active.map(b => b.name).join(", ")}`);
  return actions;
}

exports.runBots = functions
  .region("europe-west3")
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("*/45 * * * *")   // каждые 45 минут
  .timeZone("Europe/Moscow")
  .onRun(async () => { await runBotsOnce(); return null; });

exports.triggerBots = functions
  .region("europe-west3")
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
    const actions = await runBotsOnce();
    return { actions };
  });


// ────────────────────────────────────────────────────────────
// 13. Определение вида рыбы через Claude Vision (F1)
// ────────────────────────────────────────────────────────────
exports.identifyFish = onCall(
  { region: "europe-west3", timeoutSeconds: 60, memory: "512MiB", cors: true },
  async (request) => {
    const { imageBase64 } = request.data;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new HttpsError("invalid-argument", "imageBase64 required");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || functions.config().anthropic?.api_key;
    if (!apiKey) throw new HttpsError("internal", "AI не настроен");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageBase64.slice(0, 1500000) }
            },
            {
              type: "text",
              text: "Определи вид рыбы на фото. Ответь строго в формате JSON (без markdown): {\"fish\": \"название рыбы на русском\", \"confidence\": число от 1 до 100, \"weight_estimate\": \"примерный вес например 0.5-1.5 кг\", \"tip\": \"краткий совет по ловле в одно предложение\"}. Если рыбы нет — {\"fish\": null, \"confidence\": 0}."
            }
          ]
        }]
      }),
    });

    if (!response.ok) {
      functions.logger.error("identifyFish Anthropic error:", response.status);
      throw new HttpsError("internal", "Сервис ИИ временно недоступен");
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";
    functions.logger.info(`identifyFish: ${text.slice(0, 100)}`);

    try {
      const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || text;
      const parsed = JSON.parse(jsonStr);
      return {
        fish: parsed.fish || null,
        confidence: Math.max(0, Math.min(100, parseInt(parsed.confidence) || 0)),
        weight_estimate: parsed.weight_estimate || null,
        tip: parsed.tip || null,
      };
    } catch(e) {
      return { fish: text.trim().slice(0, 50) || null, confidence: 60 };
    }
  }
);


// ────────────────────────────────────────────────────────────
// 14. Push при изменении клёва (давление ±3мм рт.ст.) (F3)
// ────────────────────────────────────────────────────────────
exports.pushBiteChange = functions
  .region("europe-west3")
  .pubsub.schedule("0 * * * *")
  .timeZone("Europe/Moscow")
  .onRun(async () => {
    // Получаем текущее давление через Open-Meteo
    const lat = 47.27, lon = 39.87;
    let pressure;
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=surface_pressure&timezone=Europe%2FMoscow`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      pressure = data.current?.surface_pressure;
      if (!pressure) return null;
      pressure = Math.round(pressure * 0.750064); // гПа → мм рт.ст.
    } catch(e) {
      functions.logger.warn("pushBiteChange: weather fetch failed", e.message);
      return null;
    }

    // Сравниваем с прошлым значением
    const metaRef = db.collection("_meta").doc("pressure_cache");
    const meta = await metaRef.get();
    const prev = meta.exists ? meta.data().pressure : null;

    await metaRef.set({ pressure, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    if (prev === null) return null;
    const delta = Math.abs(pressure - prev);
    if (delta < 3) return null;

    const rising = pressure > prev;
    const title = rising ? "⬆ Давление растёт — карась и лещ активны!" : "⬇ Давление падает — хищник оживляется!";
    const body = rising
      ? `Давление: ${prev} → ${pressure} мм рт.ст. Хороший момент для мирной рыбы.`
      : `Давление: ${prev} → ${pressure} мм рт.ст. Щука и судак выходят на охоту.`;

    const tokensSnap = await db.collection("fcm_tokens").get();
    const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
    if (tokens.length === 0) return null;

    const msg = {
      notification: { title, body },
      data: { url: "https://eger-ai.app/", type: "bite_change" },
      tokens: tokens.slice(0, 500),
    };
    const r = await admin.messaging().sendEachForMulticast(msg);
    functions.logger.info(`pushBiteChange delta=${delta}мм, sent=${r.successCount}/${tokens.length}`);
    return null;
  });


// ────────────────────────────────────────────────────────────
// 15. Автоудаление истёкших объявлений барахолки (F7)
// ────────────────────────────────────────────────────────────
exports.deleteExpiredClassifieds = functions
  .region("europe-west3")
  .pubsub.schedule("0 3 * * *")
  .timeZone("Europe/Moscow")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection("classifieds")
      .where("expiresAt", "<=", now)
      .get();
    if (snap.empty) return null;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    functions.logger.info(`deleteExpiredClassifieds: removed ${snap.size} items`);
    return null;
  });
