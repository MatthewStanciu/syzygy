import Telnyx from "telnyx";

export type TranscriptionData = {
  confidence: number;
  is_final: boolean;
  transcript: string;
};

export type CallControlEvent =
  | Telnyx.CallHangupWebhookEvent
  | Telnyx.CallInitiatedWebhookEvent
  | Telnyx.CallAnsweredWebhookEvent
  | Telnyx.CallSpeakEndedWebhookEvent
  | Telnyx.TranscriptionWebhookEvent
  | Telnyx.CallDtmfReceivedWebhookEvent
  | Telnyx.CallPlaybackEndedWebhookEvent;
