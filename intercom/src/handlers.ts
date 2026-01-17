import type { Context } from "hono";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { telnyx, shouldForwardCall } from "./services";
import { openDoor, checkForPhraseMatch, upsampleAndAmplify } from "./utils";
import {
  ENV,
  INTERCOM_PHONE_NUMBER,
  DOOR_CODE,
  BEEP_AUDIO_URL,
  OPENAI_WS_URL,
  VAD,
  CALL_TRANSFER,
} from "./config";
import type { CallControlEvent } from "./types";

// =============================================================================
// Call Handler State
// =============================================================================

// Store OpenAI WebSocket connections keyed by callControlId
const openAISockets = new Map<string, WebSocket>();

// Store DTMF digits keyed by callControlId to prevent race conditions
const dtmfDigitsPerCall = new Map<string, string[]>();

// =============================================================================
// Call Event Handler
// =============================================================================

function isIntercomCall(to: string | undefined): boolean {
  return to === INTERCOM_PHONE_NUMBER;
}

export async function handleCallEvent(c: Context): Promise<Response> {
  const call = (await c.req.json()) as CallControlEvent;

  try {
    const callControlId = call.data?.payload?.call_control_id;
    if (!call.data || !callControlId) {
      return c.json({ error: "Missing call control ID" }, 500);
    }

    const eventType = call.data.event_type;
    const payload = call.data.payload as { to?: string };
    const to = payload.to;

    switch (eventType) {
      case "call.hangup":
        handleHangup(callControlId);
        break;

      case "call.initiated":
        if (isIntercomCall(to)) {
          await handleInitiated(callControlId);
        }
        break;

      case "call.answered":
        if (isIntercomCall(to)) {
          await handleAnswered(callControlId);
        }
        break;

      case "call.dtmf.received":
        await handleDtmfReceived(callControlId, call);
        break;
    }

    return c.json({ status: "success" });
  } catch (error) {
    console.error("Error handling call event:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

function handleHangup(callControlId: string): void {
  console.log("Call has ended.");
  openAISockets.delete(callControlId);
  dtmfDigitsPerCall.delete(callControlId);
}

async function handleInitiated(callControlId: string): Promise<void> {
  const openAIWS = new WebSocket(OPENAI_WS_URL, {
    headers: {
      Authorization: "Bearer " + ENV.OPENAI_API_KEY,
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
                threshold: VAD.THRESHOLD,
                prefix_padding_ms: VAD.PREFIX_PADDING_MS,
                silence_duration_ms: VAD.SILENCE_DURATION_MS,
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
        data.type === "conversation.item.input_audio_transcription.completed"
      ) {
        const transcript = data.transcript;
        console.log("Transcript:", transcript);
        checkForPhraseMatch(transcript, callControlId);
      }
    } catch (e) {
      console.error("Error parsing OpenAI message:", e);
    }
  });

  openAIWS.addEventListener("error", (e) => {
    console.error("OpenAI WebSocket error:", e);
  });

  await telnyx.calls.actions.answer(callControlId, {
    webhook_url_method: "POST",
    stream_track: "inbound_track",
    stream_url: ENV.MEDIA_STREAM_URL,
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

async function handleAnswered(callControlId: string): Promise<void> {
  if (await shouldForwardCall()) {
    try {
      await telnyx.calls.actions.transfer(callControlId, {
        to: ENV.MY_PHONE_NUMBER,
        early_media: true,
        timeout_secs: CALL_TRANSFER.TIMEOUT_SECS,
        time_limit_secs: CALL_TRANSFER.TIME_LIMIT_SECS,
        mute_dtmf: "none",
        answering_machine_detection: "disabled",
        sip_transport_protocol: "UDP",
        media_encryption: "disabled",
        webhook_url_method: "POST",
      });
    } catch (err) {
      console.error("Error transferring call:", err);
    }
    return;
  }

  console.log("Call answered, playing beep");
  try {
    await telnyx.calls.actions.startPlayback(callControlId, {
      audio_url: BEEP_AUDIO_URL,
      loop: 1,
      overlay: false,
      target_legs: "self",
      cache_audio: true,
      audio_type: "mp3",
    });
  } catch (err) {
    console.error("Failed to play beep:", err);
  }
}

async function handleDtmfReceived(
  callControlId: string,
  call: CallControlEvent
): Promise<void> {
  if (call.data?.event_type !== "call.dtmf.received") return;

  const digit = call.data?.payload?.digit;
  if (typeof digit !== "string") {
    return;
  }

  if (!dtmfDigitsPerCall.has(callControlId)) {
    dtmfDigitsPerCall.set(callControlId, []);
  }

  const digits = dtmfDigitsPerCall.get(callControlId)!;
  digits.push(digit);

  const enteredCode = digits.join("").slice(-DOOR_CODE.length);
  if (enteredCode === DOOR_CODE) {
    await openDoor(callControlId);
    digits.length = 0;
  }
}

// =============================================================================
// Media Stream Handler
// =============================================================================

type MediaStreamMessage = {
  event: string;
  start?: {
    call_control_id: string;
  };
  media?: {
    payload: string;
  };
};

export function createMediaStreamHandler() {
  let callControlId: string | null = null;
  let openAIWS: WebSocket | null = null;

  return {
    async onMessage(event: MessageEvent<WSMessageReceive>, _ws: WSContext) {
      try {
        const eventData = event.data.toString();
        const data: MediaStreamMessage = JSON.parse(eventData);

        if (data.event === "start" && data.start?.call_control_id) {
          callControlId = data.start.call_control_id;
          openAIWS = openAISockets.get(callControlId) ?? null;
        }

        if (openAIWS && data.event === "media" && data.media?.payload) {
          const audioBuffer = Buffer.from(data.media.payload, "base64");
          const upsampled = upsampleAndAmplify(audioBuffer);

          openAIWS.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: upsampled,
            })
          );
        }
      } catch (err) {
        console.error("Error processing media stream message:", err);
      }
    },
  };
}
