import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { upgradeWebSocket, websocket } from "hono/bun";
import Telnyx from "telnyx";
import * as http from "http";
import {
  getAllPhrases,
  markPhraseAsUsed,
  resetPhrasesIfAllUsed,
  openDoor,
  isCloseMatch,
  shouldForwardCall,
  amplifyPCM,
  flushBuffer,
  isChunkSilent,
  rollingAverage,
  avgAmplitude,
} from "./lib/util";

// Patch http.ClientRequest to handle undefined timeout values
// The current version of the Telnyx SDK is so bad
const originalSetTimeout = http.ClientRequest.prototype.setTimeout;
http.ClientRequest.prototype.setTimeout = function (
  msecs: any,
  callback?: () => void
) {
  // If msecs is undefined, use a default value of 30 seconds
  if (msecs === undefined) {
    msecs = 20000;
  }
  return originalSetTimeout.call(this, msecs, callback);
};

// Initialize Telnyx client
const telnyx = new Telnyx(`${process.env.TELNYX_API_KEY}`);
const app = new Hono();

const codeDigits: string[] = [];

type TranscriptionData = {
  confidence: number;
  is_final: boolean;
  transcript: string;
};

type CallControlEvent =
  | Telnyx.events.CallHangupEvent
  | Telnyx.events.CallInitiatedEvent
  | Telnyx.events.CallAnsweredEvent
  | Telnyx.events.CallSpeakEndedEvent
  | Telnyx.events.TranscriptionEvent
  | Telnyx.events.CallDtmfReceivedEvent
  | Telnyx.events.CallPlaybackEndedEvent;

app.get("/intercom", async (request, _response) => {
  return request.html(`<h1>hi</h1>`);
});

app.use("/public/*", serveStatic({ root: "./" }));
app.get("/beep.mp3", serveStatic({ path: "./public/beep.mp3" }));

app.post("/intercom", async (request, _res) => {
  const call = (await request.req.json()) as CallControlEvent;
  console.log({ call });
  try {
    const callControlId = call.data?.payload?.call_control_id;
    if (!call.data || !callControlId) {
      return request.json({ error: "Can't find call control ID" }, 500);
    }

    if (call.data.event_type === "call.hangup") {
      console.log("Call has ended.");
    } else if (call.data.event_type === "call.initiated") {
      const to = call.data.payload?.to;

      if (to && to === "+14155491627") {
        console.log("initiated");
        telnyx.calls.answer(callControlId, {
          webhook_url_method: "POST",
          stream_track: "inbound_track",
          stream_url: "wss://428cf086f998.ngrok-free.app/media-stream",
          stream_bidirectional_codec: "L16",
          send_silence_when_idle: false,
          transcription: false,
          record_channels: "single",
          record_format: "wav",
          record_timeout_secs: 0,
          record_track: "both",
          record_max_length: 600,
        });
      }
    } else if (call.data.event_type === "call.answered") {
      const to = call.data.payload?.to;
      console.log("to: ", call.data.payload?.to);

      if (to && to === "+14155491627") {
        if (await shouldForwardCall()) {
          await telnyx.calls
            .transfer(callControlId, {
              to: `${process.env.MY_PHONE_NUMBER}`,
              early_media: true,
              timeout_secs: 30,
              time_limit_secs: 14400,
              mute_dtmf: "none",
              answering_machine_detection: "disabled",
              sip_transport_protocol: "UDP",
              media_encryption: "disabled",
              webhook_url_method: "POST",
            })
            .catch(
              (err: Error) =>
                `error transferring call: ${
                  (err.cause, err.message, err.name, err.stack)
                }`
            );
          return request.json({ status: "success" });
        }

        console.log("call answered, playing beep");
        telnyx.calls
          .playbackStart(callControlId, {
            audio_url: "https://doggo.ninja/yeLcOA.mp3",
            loop: 1,
            overlay: false,
            target_legs: "self",
            cache_audio: true,
            audio_type: "mp3",
          })
          .catch((err) => console.error("failed to play beep", err));
      }
    } else if (call.data.event_type === "call.playback.ended") {
      if (call.data.payload?.media_url === "https://doggo.ninja/yeLcOA.mp3") {
        // After beep sound ends, listen for & parse passphrase
        telnyx.calls.transcriptionStart(callControlId, {
          transcription_engine: "A",
          transcription_tracks: "inbound",
        });
      }
    } else if (call.data.event_type === "call.transcription") {
      // const transcriptionData = call.data.payload!
      //   .transcription_data as TranscriptionData;
      // const transcription = transcriptionData.transcript.trim().toLowerCase();
      // console.log({ transcription });
      // const allPhrases = await getAllPhrases();
      // const matchingPhrase = allPhrases.find((p) =>
      //   isCloseMatch(p.key, transcription, 0.45)
      // );
      // if (matchingPhrase) {
      //   console.log("Phrase recognized:", matchingPhrase.key);
      //   const isUsed =
      //     matchingPhrase.value &&
      //     !isNaN(new Date(matchingPhrase.value as string).getTime());
      //   if (isUsed) {
      //     console.log("Phrase already used, hanging up");
      //     await telnyx.calls.hangup(callControlId, {});
      //   } else {
      //     await openDoor(callControlId);
      //     // await markPhraseAsUsed(matchingPhrase.key);
      //     // await resetPhrasesIfAllUsed();
      //   }
      // } else {
      //   if (transcription.split(" ").length >= 3) {
      //     console.log(
      //       "phrase not recognized, playing extremely loud incorrect buzzer"
      //     );
      //     // telnyx.calls
      //     //   .playbackStart(callControlId, {
      //     //     audio_url: "https://doggo.ninja/DJdRcR.mp3",
      //     //     loop: 1,
      //     //     overlay: false,
      //     //     target_legs: "self",
      //     //     cache_audio: true,
      //     //     audio_type: "mp3",
      //     //   })
      //     //   .catch((err) => console.error("failed to play buzzer", err));
      //   }
      // }
    } else if (call.data.event_type === "call.dtmf.received") {
      console.log(call.data.payload);
      const digit = call.data.payload!.digit as string;
      codeDigits.push(digit);

      console.log(codeDigits.join(""), codeDigits.join("").slice(-4));
      if (codeDigits.join("").slice(-4) === "1009") {
        await openDoor(callControlId);
        codeDigits.length = 0;
      }
    } else {
      console.log("unknown event!", call.data.event_type);
    }

    return request.json({ status: "success" });
  } catch (error) {
    console.log("Error issuing call command");
    console.log(error);
    return request.json({ error: "Internal server error" }, 500);
  }
});

app.get(
  "/media-stream",
  upgradeWebSocket((c) => {
    const audioBuffers: any = {};
    const SAMPLE_WINDOW_MS = 1000; // Rolling window to judge for silence
    const CHUNK_MS = 20; // Approx ms per audio chunk (adjust for your stream)
    const WINDOW_SIZE = Math.ceil(SAMPLE_WINDOW_MS / CHUNK_MS); // e.g. 50 for 1s window
    // TUNE THIS: Silence threshold depends on your system/environment
    const SILENCE_THRESHOLD = 10000; // tweak between 100-1000

    return {
      async onMessage(event, ws) {
        // console.log(`Message from client: ${event.data}`);
        let raw = event.data;

        // Handle Blob or Buffer or string
        if (raw instanceof Blob) {
          raw = await raw.text(); // works in Bun/Browsers
        } else if (raw instanceof Uint8Array) {
          raw = Buffer.from(raw).toString("utf8");
        } else if (typeof raw !== "string") {
          raw = String(raw); // fallback
        }

        let msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          console.warn("Not JSON from Telnyx:", raw);
          return;
        }

        if (msg.event !== "media" || !msg.media || !msg.media.payload) return;

        const { stream_id, media } = msg;
        const { payload } = media;
        const pcmChunk = Buffer.from(payload, "base64");
        const gain = 1.0;
        // const amplifiedChunk = amplifyPCM(pcmChunk, gain);
        const amplifiedChunk = pcmChunk;

        // Set up state for this stream_id
        if (!audioBuffers[stream_id]) {
          audioBuffers[stream_id] = { buf: [], ampWindow: [] };
        }
        const state = audioBuffers[stream_id];
        state.buf.push(amplifiedChunk);

        // Analyze amplitude
        const amplitude = avgAmplitude(amplifiedChunk);
        state.ampWindow.push(amplitude);
        if (state.ampWindow.length > WINDOW_SIZE) state.ampWindow.shift(); // keep only latest WINDOW_SIZE

        // Every chunk, check rolling average
        const avg = rollingAverage(state.ampWindow);

        // DEBUG: Print avg for a sense of scale
        console.log(`[${stream_id}] rolling avg amplitude: ${avg.toFixed(1)}`);

        // Only flush if we have buffered something and it's now "quiet"
        if (
          avg < SILENCE_THRESHOLD &&
          !state.inSilence &&
          state.buf.length > 0 &&
          state.ampWindow.length === WINDOW_SIZE
        ) {
          flushBuffer(audioBuffers, stream_id);
          state.inSilence = true;
          // Optionally, clear out the window to avoid repeated flushes for the same pause
          state.ampWindow.length = 0;
        }
        if (avg >= SILENCE_THRESHOLD) {
          state.inSilence = false;
        }
      },
      onClose: () => {
        console.log("Connection closed");
      },
    };
  })
);

export default {
  fetch: app.fetch,
  websocket,
};
