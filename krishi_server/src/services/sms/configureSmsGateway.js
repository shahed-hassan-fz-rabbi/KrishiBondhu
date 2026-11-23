import { env } from "../../config/env.config.js";
import { createBulkSmsBdGateway, readBulkSmsBdConfig } from "./bulksmsbd.gateway.js";
import { registerSmsGateway, getSmsMode } from "./smsSender.service.js";

/**
 * Explicit wiring for the notification SMS gateway.
 *
 * NOTE: This module is NOT imported by server.js in Part 2. There are no alert
 * consumers yet; calling this helper is a deliberate opt-in for a later part.
 *
 * Live sending requires BOTH configured credentials AND SMS_LIVE=1. Missing
 * credentials leave the system in safe dry-run mode with no adapter registered.
 */
export function configureSmsGatewayFromEnv({ source = env, fetchImpl } = {}) {
  const config = readBulkSmsBdConfig(source);
  if (!config.configured) {
    registerSmsGateway(null);
    return { registered: false, mode: getSmsMode(), reason: "not_configured" };
  }

  const adapter = createBulkSmsBdGateway({ config, ...(fetchImpl ? { fetchImpl } : {}) });
  // Pass `live` explicitly — registration alone must never start real sending.
  registerSmsGateway(adapter, { live: config.live });
  return { registered: true, mode: getSmsMode(), name: adapter.name, live: config.live };
}
