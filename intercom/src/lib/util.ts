import { Redis } from "@upstash/redis";
import Telnyx from "telnyx";
import { distance } from "fastest-levenshtein";

const telnyx = new Telnyx(`${process.env.TELNYX_API_KEY}`);
const redis = Redis.fromEnv();

export async function openDoor(
  callControlId: string,
  isVoice: boolean = false
) {
  console.log("opening door!");
  await telnyx.calls
    .sendDtmf(callControlId, {
      digits: "9",
      duration_millis: 500,
    })
    .then((res) => console.log("dtmf: ", res?.data?.result));
  if (isVoice) {
    await telnyx.calls.sendDtmf(callControlId, {
      digits: "9",
      duration_millis: 500,
    });
    await telnyx.calls.sendDtmf(callControlId, {
      digits: "9",
      duration_millis: 500,
    });
  }
  await telnyx.calls.hangup(callControlId, {});
}

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

export async function resetPhrasesIfAllUsed() {
  const allPhrases = await getAllPhrases();

  const allHaveDates = allPhrases.every(
    (p) => p.value && !isNaN(new Date(p.value as string).getTime())
  );

  if (!allHaveDates) {
    return false;
  }

  const sortedPhrases = allPhrases.sort(
    (a, b) =>
      new Date(b.value as string).getTime() -
      new Date(a.value as string).getTime()
  );
  const phrasesToReset = sortedPhrases.slice(3);
  await Promise.all(phrasesToReset.map((phrase) => redis.set(phrase.key, "")));

  console.log(
    `All phrases exhausted; reset ${phrasesToReset.length} phrases, all but last 3 used.`
  );
  return true;
}

export function normalizeTextForMatching(text: string): string {
  // Remove spaces, punctuation, and convert to lowercase
  // Keep only alphanumeric characters
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// This was written by Claude 4 D:
export function isCloseMatch(
  phrase: string,
  transcript: string,
  threshold: number
): boolean {
  const normalizedPhrase = normalizeTextForMatching(phrase);
  const normalizedTranscript = normalizeTextForMatching(transcript);

  // First try exact substring match for efficiency
  if (normalizedTranscript.includes(normalizedPhrase)) {
    return true;
  }

  // Then try fuzzy matching
  return (
    distance(normalizedPhrase, normalizedTranscript) <=
    normalizedPhrase.length * threshold
  );
}
