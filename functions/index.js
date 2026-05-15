const functions = require("firebase-functions");
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
exports.updateWaterLevelMeta = functions
  .region("europe-west3")
  .pubsub.schedule("0 * * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const doc = await db.collection("water_levels").doc("don-rostov").get();
    if (!doc.exists) return;
    const data = doc.data();
    const updatedAt = data.updatedAt ? data.updatedAt.toDate() : null;
    const stale = !updatedAt || (Date.now() - updatedAt.getTime()) > 3 * 60 * 60 * 1000;
    if (stale) {
      // Просто помечаем что нужно обновление — сам уровень обновляет бот
      functions.logger.warn("Water level data is stale (>3h), check bot");
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
      data: { url: url || "https://turbenbaher-del.github.io/eger-ai/" },
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
      data: { url: "https://turbenbaher-del.github.io/eger-ai/", type: "nearby_catch" },
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
      data: { url: "https://turbenbaher-del.github.io/eger-ai/", type: "weekend_forecast" },
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
      data: { url: "https://turbenbaher-del.github.io/eger-ai/", type: "fishing_reminder" },
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
exports.askEger = functions
  .region("europe-west3")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");

    const { messages = [], weather, userCatches = [] } = data;

    // Rate limit: 50 сообщений в день на пользователя
    const today = new Date().toISOString().split("T")[0];
    const usageRef = db.collection("ai_usage").doc(context.auth.uid);
    const usageDoc = await usageRef.get();
    const usageData = usageDoc.exists ? usageDoc.data() : {};
    const todayCount = usageData.date === today ? (usageData.count || 0) : 0;

    if (todayCount >= 50) {
      return { limited: true, message: "Лимит 50 сообщений в день исчерпан 🎣 Возвращайся завтра!" };
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
    if (anthropicMessages.length === 0) throw new functions.https.HttpsError("invalid-argument", "No messages");

    // API key: сначала env (Functions v2), потом config (Functions v1)
    const apiKey = process.env.ANTHROPIC_API_KEY || functions.config().anthropic?.api_key;
    if (!apiKey) {
      functions.logger.error("ANTHROPIC_API_KEY not configured");
      throw new functions.https.HttpsError("internal", "AI не настроен — обратитесь к администратору");
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
      throw new functions.https.HttpsError("internal", "Сервис ИИ временно недоступен");
    }

    const result = await response.json();
    const replyText = result.content?.[0]?.text || "Не смог ответить, попробуй ещё раз 🎣";

    // Обновляем счётчик использования
    await usageRef.set({ date: today, count: todayCount + 1 }, { merge: true });

    functions.logger.info(`askEger uid=${context.auth.uid} in=${result.usage?.input_tokens} out=${result.usage?.output_tokens}`);
    return { text: replyText };
  });
