import { Redis } from "@upstash/redis";
import Telnyx from "telnyx";
import { ENV } from "./config";

// Telnyx client
export const telnyx = new Telnyx({ apiKey: ENV.TELNYX_API_KEY });

// Redis client
export const redis = Redis.fromEnv();

// Redis key for flags (excluded from phrase queries)
export const FLAGS_KEY = "flags";

export type IntercomFlags = {
  forwardCall: boolean;
};

export async function getFlags(): Promise<IntercomFlags | null> {
  try {
    const data = await redis.get(FLAGS_KEY);
    if (!data) return null;
    if (typeof data === "string") {
      return JSON.parse(data) as IntercomFlags;
    }
    return data as IntercomFlags;
  } catch (err) {
    console.error("Failed to get flags from redis:", err);
    return null;
  }
}

export async function shouldForwardCall(): Promise<boolean> {
  const flags = await getFlags();
  return flags?.forwardCall ?? false;
}
