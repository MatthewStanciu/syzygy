// Environment variables
export const ENV = {
  TELNYX_API_KEY: process.env.TELNYX_API_KEY!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  MEDIA_STREAM_URL: process.env.MEDIA_STREAM_URL!,
  MY_PHONE_NUMBER: process.env.MY_PHONE_NUMBER!,
} as const;

// The phone number that receives intercom calls
export const INTERCOM_PHONE_NUMBER = "+14155491627";

// DTMF code to open door manually
export const DOOR_CODE = "1009";

// DTMF sequence sent to open the door (30 nines)
export const DOOR_OPEN_DTMF_SEQUENCE = "999999999999999999999999999999";
export const DOOR_OPEN_DTMF_DURATION_MS = 100;

// Delay before hanging up after opening door
export const HANGUP_DELAY_MS = 3000;

// Phrase matching threshold (0.45 = 45% Levenshtein distance allowed)
export const PHRASE_MATCH_THRESHOLD = 0.45;

// Audio processing constants
export const AUDIO = {
  INPUT_SAMPLE_RATE: 8000,
  OUTPUT_SAMPLE_RATE: 24000,
  UPSAMPLE_FACTOR: 3,
  RMS_SLICE_MS: 50,
  MIN_GAIN: 0.1,
  MAX_GAIN: 20.0,
  GAIN_DIVISOR: 10.0,
} as const;

// OpenAI Realtime API
export const OPENAI_WS_URL =
  "wss://api.openai.com/v1/realtime?intent=transcription";

// Audio file for door entry confirmation
export const BEEP_AUDIO_URL = "https://doggo.ninja/yeLcOA.mp3";

// Call transfer settings
export const CALL_TRANSFER = {
  TIMEOUT_SECS: 30,
  TIME_LIMIT_SECS: 14400,
} as const;

// Voice activity detection settings
export const VAD = {
  THRESHOLD: 0.7,
  PREFIX_PADDING_MS: 300,
  SILENCE_DURATION_MS: 1000,
} as const;
