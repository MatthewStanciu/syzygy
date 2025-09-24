import { Redis } from "@upstash/redis";
import Telnyx from "telnyx";
import { distance } from "fastest-levenshtein";
import { OpenAI } from "openai";
import { Writable } from "stream";
import wav from "wav";
import { createReadStream, unlinkSync, writeFileSync } from "fs";

const telnyx = new Telnyx(`${process.env.TELNYX_API_KEY}`);
const redis = Redis.fromEnv();

export async function openDoor(callControlId: string) {
  console.log("opening door!");
  await telnyx.calls.sendDtmf(callControlId, {
    digits: "999999999999999999999999999999",
    duration_millis: 100,
  });

  setTimeout(async () => {
    console.log("hanging up");
    await telnyx.calls.hangup(callControlId, {});
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

export function avgAmplitude(buffer: Buffer) {
  let sum = 0,
    n = buffer.length / 2;
  for (let i = 0; i < buffer.length; i += 2) {
    sum += Math.abs(buffer.readInt16LE(i));
  }
  return sum / n;
}

export function rollingAverage(arr: any) {
  if (!arr.length) return 0;
  return arr.reduce((a: any, b: any) => a + b, 0) / arr.length;
}

export function isChunkSilent(buffer: Buffer, silenceThreshold = 300) {
  // buffer: PCM 16-bit LE
  let sum = 0,
    samples = buffer.length / 2;
  for (let i = 0; i < buffer.length; i += 2) {
    let sample = buffer.readInt16LE(i);
    sum += Math.abs(sample);
  }
  const avg = sum / samples;
  // silenceThreshold: adjust for your environment!
  return avg < silenceThreshold;
}

export function amplifyPCM(buffer: Buffer, gain: number) {
  // buffer: Node.js Buffer of 16-bit signed PCM (l16)
  const amplified = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i += 2) {
    let sample = buffer.readInt16LE(i) * gain;
    // Clamp to valid 16-bit range
    sample = Math.max(-32768, Math.min(32767, Math.round(sample)));
    amplified.writeInt16LE(sample, i);
  }
  return amplified;
}

export async function flushBuffer(audioBuffers: any, streamId: number) {
  const state = audioBuffers[streamId];
  if (!state || state.buf.length === 0) return;
  // Combine all PCM chunks into one Buffer for Whisper
  const combined = Buffer.concat(state.buf);
  state.buf = [];
  console.log("Ready to transcribe buffer of length", combined.length);

  try {
    const transcript = await transcribeWithWhisper(combined);
    console.log(`Transcript: ${transcript}`);
    // TODO: Fuzzy matching and openDoor logic here!
  } catch (e) {
    console.error("Error running Whisper:", e);
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeWithWhisper(pcmBuffer: Buffer) {
  // Encode as WAV (PCM 16-bit, 1 channel, 16 kHz or 8 kHz)
  const wavBuffer = await pcmToWav(pcmBuffer);
  // Save to tmp file (OpenAI Whisper API uses file upload)
  // const tmpPath = `/tmp/chunk-${Date.now()}.wav`;
  const tmpPath = `./${Date.now()}.wav`;
  writeFileSync(tmpPath, wavBuffer);
  // Call Whisper
  const resp = await openai.audio.transcriptions.create({
    file: createReadStream(tmpPath),
    model: "whisper-1",
  });
  // Clean up
  // unlinkSync(tmpPath);
  return resp.text; // This is your transcription
}
function pcmToWav(pcmBuffer: Buffer): Promise<Buffer> {
  // Defaults: 16000 Hz, 1 channel, 16 bits
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels: 1,
      sampleRate: 16000,
      bitDepth: 16,
    });
    let buffers: Buffer[] = [];
    writer.on("data", (d: Buffer) => buffers.push(d));
    writer.on("finish", () => resolve(Buffer.concat(buffers)));
    writer.on("error", reject);
    writer.end(pcmBuffer);
  });
}
