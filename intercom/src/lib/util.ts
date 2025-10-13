import { Redis } from "@upstash/redis";
import Telnyx from "telnyx";
import { distance } from "fastest-levenshtein";

const telnyx = new Telnyx({ apiKey: `${process.env.TELNYX_API_KEY}` });
const redis = Redis.fromEnv();

export async function openDoor(callControlId: string) {
  console.log("opening door!");
  await telnyx.calls.actions.sendDtmf(callControlId, {
    digits: "999999999999999999999999999999",
    duration_millis: 100,
  });

  setTimeout(async () => {
    console.log("hanging up");
    await telnyx.calls.actions.hangup(callControlId, {});
  }, 3000);
}

export async function getAllPhrases() {
  const keys = (await redis.keys("*")).filter((key) => key !== "flags"); // it's only like 50 so this should be fine
  const phrasePairs = await Promise.all(
    keys.map(async (key) => ({
      key,
      value: await redis.get(key),
    }))
  );

  return phrasePairs;
}

type IntercomFlags = {
  forwardCall: boolean;
};
export async function shouldForwardCall() {
  const flags = (await redis.json
    .get("flags")
    .catch(
      (err) => "failed to get flag from redis: " + err.message
    )) as IntercomFlags;
  return flags.forwardCall;
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

export async function checkForPhraseMatch(
  transcript: string,
  callControlId: string
) {
  const transcription = transcript.toLowerCase();

  const allPhrases = await getAllPhrases();
  const matchingPhrase = allPhrases.find((p) =>
    isCloseMatch(p.key, transcription, 0.45)
  );

  if (matchingPhrase) {
    console.log("Phrase recognized:", matchingPhrase.key);

    const isUsed =
      matchingPhrase.value &&
      !isNaN(new Date(matchingPhrase.value as string).getTime());

    if (isUsed) {
      console.log("Phrase already used, hanging up");
      await telnyx.calls.actions.hangup(callControlId, {});
    } else {
      await openDoor(callControlId);
      await markPhraseAsUsed(matchingPhrase.key);
      await resetPhrasesIfAllUsed();
    }
  }
}

export function upsampleAndAmplify(buffer8k: Buffer): string {
  const samplesIn = buffer8k.length / 2;
  const buffer24k = Buffer.alloc(samplesIn * 3 * 2);

  // Convert buffer to float array for processing
  const audioData: number[] = [];
  for (let i = 0; i < samplesIn; i++) {
    // Convert 16-bit int to float (-1.0 to 1.0 range)
    const sample = buffer8k.readInt16LE(i * 2) / 32768.0;
    audioData.push(sample);
  }

  // Calculate 95th percentile RMS normalization gain
  const gain = calculate95thPercentileGain(audioData, 8000); // 8kHz sample rate

  // Apply gain and upsample
  for (let i = 0; i < samplesIn; i++) {
    let sample = buffer8k.readInt16LE(i * 2);

    // Apply calculated gain
    sample = Math.round(sample * gain);

    // Clamp to valid 16-bit range
    sample = Math.max(-32768, Math.min(32767, sample));

    // Write each sample 3 times for 3x upsampling
    buffer24k.writeInt16LE(sample, i * 6);
    buffer24k.writeInt16LE(sample, i * 6 + 2);
    buffer24k.writeInt16LE(sample, i * 6 + 4);
  }

  return buffer24k.toString("base64");
}

function calculate95thPercentileGain(
  audioData: number[],
  sampleRate: number
): number {
  // Calculate RMS in 50ms slices (like the original code)
  const sliceLen = Math.floor(sampleRate * 0.05); // 50ms slices
  const averages: number[] = [];
  let sum = 0.0;

  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] ** 2; // Square the sample

    if (i % sliceLen === 0 && i > 0) {
      // Calculate RMS for this slice
      const rms = Math.sqrt(sum / sliceLen);
      averages.push(rms);
      sum = 0;
    }
  }

  // Handle remaining samples
  if (sum > 0) {
    const remainingSamples = audioData.length % sliceLen;
    if (remainingSamples > 0) {
      const rms = Math.sqrt(sum / remainingSamples);
      averages.push(rms);
    }
  }

  if (averages.length === 0) {
    return 1.0; // No audio data, return unity gain
  }

  // Sort averages in ascending order
  averages.sort((a, b) => a - b);

  // Take the 95th percentile
  const percentile95Index = Math.floor(averages.length * 0.95);
  const percentile95Value = averages[percentile95Index];

  if (percentile95Value === 0) {
    return 1.0; // Avoid division by zero
  }

  // Calculate gain (like the original code)
  let gain = 1.0 / percentile95Value;

  // Apply the same scaling as the original (/10.0)
  gain = gain / 10.0;

  // Optional: Add some reasonable clamping
  gain = Math.max(gain, 0.1); // Minimum gain
  gain = Math.min(gain, 20.0); // Maximum gain

  return gain;
}
