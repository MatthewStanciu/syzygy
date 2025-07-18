import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function getAllPhrases() {
  const keys = await redis.keys("*"); // it's only like 50 so this should be fine
  const phrasePairs = await Promise.all(
    keys.map(async (key) => ({
      key,
      value: await redis.get(key),
    }))
  );

  return phrasePairs;
}

export async function markPhraseAsUsed(phrase: string) {
  const isoDate = new Date().toISOString();
  await redis.set(phrase, isoDate);
  return isoDate;
}
