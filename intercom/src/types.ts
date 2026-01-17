import type Telnyx from "telnyx";

export type CallControlEvent =
  | Telnyx.CallHangupWebhookEvent
  | Telnyx.CallInitiatedWebhookEvent
  | Telnyx.CallAnsweredWebhookEvent
  | Telnyx.CallSpeakEndedWebhookEvent
  | Telnyx.TranscriptionWebhookEvent
  | Telnyx.CallDtmfReceivedWebhookEvent
  | Telnyx.CallPlaybackEndedWebhookEvent;
