import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import Telnyx from "telnyx";
import * as http from "http";
import phrases from "./lib/phrases";

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
  | Telnyx.events.CallPlaybackEndedEvent;

app.get("/intercom", async (request, _response) => {
  return request.html(`<h1>hi</h1>`);
});

app.use("/public/*", serveStatic({ root: "./" }));
app.get("/beep.mp3", serveStatic({ path: "./public/beep.mp3" }));

app.post("/intercom", async (request, _res) => {
  // const data = (request.body as CallControlEvent).data!;
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
      console.log("initiated");
      telnyx.calls.answer(callControlId, {
        webhook_url_method: "POST",
        stream_track: "inbound_track",
        send_silence_when_idle: false,
        transcription: false,
        record_channels: "single",
        record_format: "wav",
        record_timeout_secs: 0,
        record_track: "both",
        record_max_length: 600,
      });
    } else if (call.data.event_type === "call.answered") {
      // Play a beep sound first
      console.log("call answered, playing beep");
      telnyx.calls
        .playbackStart(callControlId, {
          audio_url: "https://doggo.ninja/j8R5jq.mp3",
          loop: 1,
          overlay: false,
          target_legs: "self",
          cache_audio: true,
          audio_type: "mp3",
        })
        .catch((err) => console.error("failed to play beep", err));
    } else if (call.data.event_type === "call.playback.ended") {
      console.log("Beep sound has ended.");

      // After beep sound ends, listen for & parse passphrase
      telnyx.calls.transcriptionStart(callControlId, {
        transcription_engine: "A",
        transcription_tracks: "inbound",
      });
    } else if (call.data.event_type === "call.transcription") {
      const transcriptionData = call.data.payload!
        .transcription_data as TranscriptionData;
      console.log(transcriptionData);
      const transcription = transcriptionData.transcript.trim().toLowerCase();

      if (phrases.includes(transcription)) {
        console.log("Phrase recognized:", transcription);

        await telnyx.calls
          .sendDtmf(callControlId, {
            digits: "9",
            duration_millis: 250,
          })
          .then((res) => console.log("dtmf: ", res?.data?.result));
        await telnyx.calls.hangup(callControlId, {});
      }
    }

    return request.json({ status: "success" });
  } catch (error) {
    console.log("Error issuing call command");
    console.log(error);
    return request.json({ error: "Internal server error" }, 500);
  }
});

export default app;
