import { SmsQuotaReservation } from "../../models/smsQuotaReservation.model.js";

/**
 * Atomic daily quota reservations. Aggregate log counting alone cannot bound
 * concurrent workers; each reservation is a conditional atomic increment.
 */

function reservationId({ scope, userId, day }) {
  return scope === "farmer" ? `farmer:${userId}:${day}` : `global:${day}`;
}

async function tryReserve({ model, scope, userId, day, limit }) {
  const _id = reservationId({ scope, userId, day });
  await model.updateOne(
    { _id },
    { $setOnInsert: { _id, scope, userId: scope === "farmer" ? userId : null, day, count: 0 } },
    { upsert: true }
  );
  const reserved = await model.findOneAndUpdate(
    { _id, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { new: true }
  );
  return Boolean(reserved);
}

async function release({ model, scope, userId, day }) {
  await model.updateOne(
    { _id: reservationId({ scope, userId, day }) },
    { $inc: { count: -1 } }
  );
}

export async function reserveSmsQuota({
  userId,
  day,
  farmerLimit = 5,
  globalLimit = 200,
  model = SmsQuotaReservation,
} = {}) {
  const farmer = await tryReserve({ model, scope: "farmer", userId, day, limit: farmerLimit });
  if (!farmer) return { allowed: false, reason: "FARMER_DAILY_LIMIT" };
  const global = await tryReserve({ model, scope: "global", userId: null, day, limit: globalLimit });
  if (!global) {
    await release({ model, scope: "farmer", userId, day });
    return { allowed: false, reason: "GLOBAL_DAILY_LIMIT" };
  }
  return { allowed: true };
}

export async function releaseSmsQuota({ userId, day, model = SmsQuotaReservation } = {}) {
  await release({ model, scope: "farmer", userId, day });
  await release({ model, scope: "global", userId: null, day });
}
