import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import Telnyx from "telnyx";
import * as http from "http";
import {
  getAllPhrases,
  markPhraseAsUsed,
  resetPhrasesIfAllUsed,
  normalizeTextForMatching,
  openDoor,
  isCloseMatch,
  shouldForwardCall,
  shouldForwardCall,
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
      // After beep sound ends, listen for & parse passphrase
      telnyx.calls.transcriptionStart(callControlId, {
        transcription_engine: "A",
        transcription_tracks: "inbound",
      });
    } else if (call.data.event_type === "call.transcription") {
      const transcriptionData = call.data.payload!
        .transcription_data as TranscriptionData;
      // console.log(transcriptionData);
      const transcription = transcriptionData.transcript.trim().toLowerCase();
      console.log({ transcription });

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
          await telnyx.calls.hangup(callControlId, {});
        } else {
          await openDoor(callControlId, true);
          // await markPhraseAsUsed(matchingPhrase.key);
          // await resetPhrasesIfAllUsed();
        }
      }
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

export default app;
