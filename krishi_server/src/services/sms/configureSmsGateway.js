import { env } from "../../config/env.config.js";
import { createBulkSmsBdGateway, readBulkSmsBdConfig } from "./bulksmsbd.gateway.js";
import { createAlphaSmsGateway, readAlphaSmsConfig } from "./alphaSms.gateway.js";
import { registerSmsGateway, getSmsMode } from "./smsSender.service.js";

/**
 * Explicit wiring for the notification SMS gateway (Part 2+).
 * NOT imported by server.js — calling this helper is a deliberate opt-in.
 * Provider selection is determined by SMS_PROVIDER; both adapters remain
 * available and neither is registered unless its credentials are configured.
 * Live sending requires configured credentials AND SMS_LIVE=1.
 */

export function configureSmsGatewayFromEnv({ source = env, fetchImpl } = {}) {
  const provider = String(source.smsProvider || "").trim().toLowerCase();
  let config;
  let factory;

  if (provider === "alpha_sms") {
    config = readAlphaSmsConfig(source);
    factory = createAlphaSmsGateway;
  } else if (provider === "bulksmsbd" || provider === "") {
    // BulkSMSBD stays the default provider for backwards compatibility.
    config = readBulkSmsBdConfig(source);
    factory = createBulkSmsBdGateway;
  } else {
    registerSmsGateway(null);
    return { registered: false, mode: getSmsMode(), reason: "unknown_provider" };
  }

  if (!config.configured) {
    registerSmsGateway(null);
    return { registered: false, mode: getSmsMode(), reason: "not_configured" };
  }

  const adapter = factory({ config, ...(fetchImpl ? { fetchImpl } : {}) });
  // Pass `live` explicitly — registration alone must never start real sending.
  registerSmsGateway(adapter, { live: config.live });
  return {
    registered: true,
    mode: getSmsMode(),
    name: adapter.name,
    live: config.live,
    provider: adapter.name,
  };
}
