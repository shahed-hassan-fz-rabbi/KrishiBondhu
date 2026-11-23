import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.config.js";
import { PhoneVerification } from "../models/phoneverification.model.js";
import { User } from "../models/user.model.js";
import { sendVerificationCodeSms } from "./sms.service.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const DAILY_SEND_LIMIT = 5;
const MAX_FAILED_ATTEMPTS = 5;
const digestCode = (userId, phone, code) => createHmac("sha256", env.jwtSecret).update(`${userId}:${phone}:${code}`).digest("hex");

export class PhoneVerificationService {
  static async sendCode(userId, { transport = sendVerificationCodeSms, now = new Date() } = {}) {
    const user = await User.findById(userId).select("phone");
    if (!user?.phone) return { success: false, status: 400, code: "PHONE_REQUIRED", message: "Add a Bangladesh mobile number first" };
    let record = await PhoneVerification.findOne({ userId });
    if (record?.phone !== user.phone) record = null;
    if (record?.lastSentAt && now - record.lastSentAt < RESEND_COOLDOWN_MS) {
      return { success: false, status: 429, code: "OTP_COOLDOWN", message: "Wait one minute before requesting another code" };
    }
    const windowActive = record?.dailyWindowStartedAt && now - record.dailyWindowStartedAt < 24 * 60 * 60 * 1000;
    if (windowActive && record.dailySentCount >= DAILY_SEND_LIMIT) {
      return { success: false, status: 429, code: "OTP_DAILY_LIMIT", message: "Daily verification SMS limit reached; try again tomorrow" };
    }
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const delivery = await transport(user.phone, code);
    if (!delivery.sent) {
      return { success: false, status: delivery.reason === "provider_not_configured" ? 503 : 502, code: "SMS_UNAVAILABLE", message: delivery.reason === "provider_not_configured" ? "SMS verification is not configured yet" : "Could not send the verification code" };
    }
    const windowStartedAt = windowActive ? record.dailyWindowStartedAt : now;
    await PhoneVerification.findOneAndUpdate(
      { userId },
      {
        $set: {
          phone: user.phone,
          codeHash: digestCode(userId, user.phone, code),
          codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
          lastSentAt: now,
          dailyWindowStartedAt: windowStartedAt,
          dailySentCount: windowActive ? record.dailySentCount + 1 : 1,
          failedAttempts: 0,
          expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { success: true, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  static async verifyCode(userId, candidate) {
    if (typeof candidate !== "string" || !/^\d{6}$/.test(candidate)) {
      return { success: false, status: 400, code: "INVALID_CODE", message: "Enter the six-digit verification code" };
    }
    const [record, user] = await Promise.all([
      PhoneVerification.findOne({ userId }).select("+codeHash"),
      User.findById(userId),
    ]);
    if (!record || !user?.phone || record.phone !== user.phone || record.codeExpiresAt < new Date()) {
      return { success: false, status: 400, code: "CODE_EXPIRED", message: "The code expired; request a new one" };
    }
    if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return { success: false, status: 429, code: "TOO_MANY_CODE_ATTEMPTS", message: "Too many incorrect codes; request another code later" };
    }
    const expected = Buffer.from(record.codeHash, "hex");
    const received = Buffer.from(digestCode(userId, user.phone, candidate), "hex");
    if (!timingSafeEqual(expected, received)) {
      record.failedAttempts += 1;
      await record.save();
      return { success: false, status: 400, code: "INVALID_CODE", message: "That code does not match" };
    }
    user.phoneVerifiedAt = new Date();
    await user.save();
    record.codeExpiresAt = new Date();
    await record.save();
    return { success: true, user };
  }
}
