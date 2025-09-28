import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { upgradeWebSocket, websocket } from "hono/bun";
import Telnyx from "telnyx";
import * as http from "http";
import {
  openDoor,
  shouldForwardCall,
  checkForPhraseMatch,
  upsampleAndAmplify,
} from "./lib/util";
import { CallControlEvent } from "./lib/types";

// Initialize Telnyx client
const telnyx = new Telnyx({ apiKey: `${process.env.TELNYX_API_KEY}` });
const app = new Hono();

const codeDigits: string[] = [];

const openAISockets = new Map<string, WebSocket>();
const openAIWSUrl = "wss://api.openai.com/v1/realtime?intent=transcription";

app.get("/intercom", async (request, _response) => {
  return request.html(`<h1>hi</h1>`);
});

app.use("/public/*", serveStatic({ root: "./" }));
app.get("/beep.mp3", serveStatic({ path: "./public/beep.mp3" }));

app.post("/intercom", async (request, _res) => {
  const call = (await request.req.json()) as CallControlEvent;
  // console.log({ call });
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
        // console.log("initiated");
        const openAIWS = new WebSocket(openAIWSUrl, {
          // Zed's language server is complaining because it thinks this is Node.js' WebSocket implementation,
          // but it's actually Bun's and you can do this with Bun's
          headers: {
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
            // "OpenAI-Beta": "realtime=v1",
          },
        });

        openAISockets.set(callControlId, openAIWS);

        openAIWS.addEventListener("open", () => {
          openAIWS.send(
            JSON.stringify({
              type: "session.update",
              session: {
                type: "transcription",
                audio: {
                  input: {
                    format: {
                      type: "audio/pcm",
                      rate: 24000,
                    },
                    transcription: {
                      model: "whisper-1",
                      prompt:
                        "Listen for surrealist phrases of a few words long. Repeat exactly what you hear, in English.",
                      language: "en",
                    },
                    turn_detection: {
                      type: "server_vad",
                      threshold: 0.7,
                      prefix_padding_ms: 300,
                      silence_duration_ms: 1000,
                    },
                  },
                },
              },
            })
          );
        });
        openAIWS.addEventListener("message", (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("OpenAI event:", data.type);
            console.log(data);

            if (
              data.type ===
              "conversation.item.input_audio_transcription.completed"
            ) {
              const transcript = data.transcript;
              console.log("Transcript:", transcript);

              checkForPhraseMatch(transcript, callControlId);
            }
          } catch (e) {
            console.error("Error parsing OpenAI message:", e);
          }
        });

        telnyx.calls.actions.answer(callControlId, {
          webhook_url_method: "POST",
          stream_track: "inbound_track",
          stream_url: "wss://428cf086f998.ngrok-free.app/media-stream",
          stream_bidirectional_codec: "L16",
          stream_bidirectional_mode: "rtp",
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
      // console.log("to: ", call.data.payload?.to);

      if (to && to === "+14155491627") {
        if (await shouldForwardCall()) {
          await telnyx.calls.actions
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
        telnyx.calls.actions
          .startPlayback(callControlId, {
            audio_url: "https://doggo.ninja/yeLcOA.mp3",
            loop: 1,
            overlay: false,
            target_legs: "self",
            cache_audio: true,
            audio_type: "mp3",
          })
          .catch((err) => console.error("failed to play beep", err));
      }
    } else if (call.data.event_type === "call.dtmf.received") {
      console.log(call.data.payload);
      const digit = call.data.payload!.digit as string;
      codeDigits.push(digit);

      // console.log(codeDigits.join(""), codeDigits.join("").slice(-4));
      if (codeDigits.join("").slice(-4) === "1009") {
        await openDoor(callControlId);
        codeDigits.length = 0;
      }
    } else {
      // console.log("unknown event!", call.data.event_type);
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
  upgradeWebSocket(() => {
    let callControlId = null;
    let openAIWS: WebSocket | null | undefined = null;

    return {
      async onMessage(event, ws) {
        let eventData = event.data.toString();
        try {
          const dataJson = JSON.parse(eventData);

          if (dataJson.event === "start") {
            callControlId = dataJson.start?.call_control_id;
            openAIWS = openAISockets.get(callControlId);
          }

          if (
            openAIWS &&
            dataJson.event === "media" &&
            dataJson.media &&
            dataJson.media.payload
          ) {
            console.log("made it here hehe", dataJson.media.payload);
            const audioBuffer = Buffer.from(dataJson.media.payload, "base64");
            const upsampled = upsampleAndAmplify(audioBuffer);

            openAIWS.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: upsampled,
              })
            );
          }
        } catch {}
      },
    };
  })
);

export default {
  fetch: app.fetch,
  websocket,
};
