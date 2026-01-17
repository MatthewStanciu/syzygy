import { distance } from "fastest-levenshtein";
import { telnyx, redis, FLAGS_KEY } from "./services";
import {
  AUDIO,
  PHRASE_MATCH_THRESHOLD,
  DOOR_OPEN_DTMF_SEQUENCE,
  DOOR_OPEN_DTMF_DURATION_MS,
  HANGUP_DELAY_MS,
} from "./config";

// =============================================================================
// Audio Processing
// =============================================================================

export function upsampleAndAmplify(buffer8k: Buffer): string {
  const samplesIn = buffer8k.length / 2;
  const buffer24k = Buffer.alloc(samplesIn * AUDIO.UPSAMPLE_FACTOR * 2);

  // Convert buffer to float array for RMS calculation
  const audioData: number[] = [];
  for (let i = 0; i < samplesIn; i++) {
    const sample = buffer8k.readInt16LE(i * 2) / 32768.0;
    audioData.push(sample);
  }

  const gain = calculate95thPercentileGain(audioData);

  // Apply gain and upsample (3x)
  for (let i = 0; i < samplesIn; i++) {
    let sample = buffer8k.readInt16LE(i * 2);
    sample = Math.round(sample * gain);
    sample = Math.max(-32768, Math.min(32767, sample));

    // Write each sample 3 times for 3x upsampling
    buffer24k.writeInt16LE(sample, i * 6);
    buffer24k.writeInt16LE(sample, i * 6 + 2);
    buffer24k.writeInt16LE(sample, i * 6 + 4);
  }

  return buffer24k.toString("base64");
}

function calculate95thPercentileGain(audioData: number[]): number {
  const sliceLen = Math.floor(
    AUDIO.INPUT_SAMPLE_RATE * (AUDIO.RMS_SLICE_MS / 1000)
  );
  const rmsValues: number[] = [];
  let sum = 0.0;

  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] ** 2;

    if (i % sliceLen === 0 && i > 0) {
      rmsValues.push(Math.sqrt(sum / sliceLen));
      sum = 0;
    }
  }

  // Handle remaining samples
  const remainingSamples = audioData.length % sliceLen;
  if (sum > 0 && remainingSamples > 0) {
    rmsValues.push(Math.sqrt(sum / remainingSamples));
  }

  if (rmsValues.length === 0) {
    return 1.0;
  }

  rmsValues.sort((a, b) => a - b);

  const percentile95Index = Math.floor(rmsValues.length * 0.95);
  const percentile95Value = rmsValues[percentile95Index];

  if (percentile95Value === 0) {
    return 1.0;
  }

  let gain = 1.0 / percentile95Value;
  gain = gain / AUDIO.GAIN_DIVISOR;
  gain = Math.max(gain, AUDIO.MIN_GAIN);
  gain = Math.min(gain, AUDIO.MAX_GAIN);

  return gain;
}

// =============================================================================
// Phrase Matching
// =============================================================================

export type Phrase = {
  key: string;
  value: string | null;
};

export async function getAllPhrases(): Promise<Phrase[]> {
  const keys = (await redis.keys("*")).filter((key) => key !== FLAGS_KEY);
  const phrasePairs = await Promise.all(
    keys.map(async (key) => ({
      key,
      value: (await redis.get(key)) as string | null,
    }))
  );
  return phrasePairs;
}

export async function markPhraseAsUsed(phrase: string): Promise<string> {
  const isoDate = new Date().toISOString();
  await redis.set(phrase, isoDate);
  return isoDate;
}

export async function resetPhrasesIfAllUsed(): Promise<boolean> {
  const allPhrases = await getAllPhrases();

  const allHaveDates = allPhrases.every(
    (p) => p.value && !isNaN(new Date(p.value).getTime())
  );

  if (!allHaveDates) {
    return false;
  }

  // Sort by date descending (most recent first)
  const sortedPhrases = allPhrases.sort(
    (a, b) => new Date(b.value!).getTime() - new Date(a.value!).getTime()
  );

  // Keep the 3 most recently used, reset the rest
  const phrasesToReset = sortedPhrases.slice(3);
  await Promise.all(phrasesToReset.map((phrase) => redis.set(phrase.key, "")));

  console.log(
    `All phrases exhausted; reset ${phrasesToReset.length} phrases, all but last 3 used.`
  );
  return true;
}

function normalizeTextForMatching(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCloseMatch(
  phrase: string,
  transcript: string,
  threshold: number = PHRASE_MATCH_THRESHOLD
): boolean {
  const normalizedPhrase = normalizeTextForMatching(phrase);
  const normalizedTranscript = normalizeTextForMatching(transcript);

  // Exact substring match
  if (normalizedTranscript.includes(normalizedPhrase)) {
    return true;
  }

  // Fuzzy match using Levenshtein distance
  return (
    distance(normalizedPhrase, normalizedTranscript) <=
    normalizedPhrase.length * threshold
  );
}

export function isPhraseUsed(phrase: Phrase): boolean {
  return !!phrase.value && !isNaN(new Date(phrase.value).getTime());
}

export async function findMatchingPhrase(
  transcript: string
): Promise<Phrase | undefined> {
  const transcription = transcript.toLowerCase();
  const allPhrases = await getAllPhrases();
  return allPhrases.find((p) => isCloseMatch(p.key, transcription));
}

// =============================================================================
// Door Control
// =============================================================================

export async function openDoor(callControlId: string): Promise<void> {
  console.log("Opening door!");
  await telnyx.calls.actions.sendDtmf(callControlId, {
    digits: DOOR_OPEN_DTMF_SEQUENCE,
    duration_millis: DOOR_OPEN_DTMF_DURATION_MS,
  });

  setTimeout(async () => {
    console.log("Hanging up");
    await telnyx.calls.actions.hangup(callControlId, {});
  }, HANGUP_DELAY_MS);
}

export async function checkForPhraseMatch(
  transcript: string,
  callControlId: string
): Promise<void> {
  const matchingPhrase = await findMatchingPhrase(transcript);

  if (!matchingPhrase) {
    return;
  }

  console.log("Phrase recognized:", matchingPhrase.key);

  if (isPhraseUsed(matchingPhrase)) {
    console.log("Phrase already used, hanging up");
    await telnyx.calls.actions.hangup(callControlId, {});
  } else {
    await openDoor(callControlId);
    await markPhraseAsUsed(matchingPhrase.key);
    await resetPhrasesIfAllUsed();
  }
}
