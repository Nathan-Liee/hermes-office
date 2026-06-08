import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { HermesRuntimeProvider } from "@/lib/runtime/hermes/provider";
import type { RuntimeProvider } from "@/lib/runtime/types";

export const createRuntimeProvider = (
  _providerId: string,
  client: GatewayClient,
  _runtimeUrl: string
): RuntimeProvider => {
  return new HermesRuntimeProvider(client);
};
