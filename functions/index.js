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
        .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(since))
        .get();

      const map = {};
      snap.docs.forEach(d => {
        const r = d.data();
        const uid = r.userId || "anon";
        if (!map[uid]) map[uid] = { userId: uid, author: r.author || "Рыбак", catches: 0, totalKg: 0, best: 0 };
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
