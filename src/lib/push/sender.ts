// Server only: holds the VAPID private key.
import webpush from "web-push";
import type { PushResult, PushSender } from "./check";

export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Push services require a contact. Set VAPID_SUBJECT to a mailto: or https: address of your own. */
export function createPushSender(): PushSender {
  const options = {
    vapidDetails: {
      subject: process.env.VAPID_SUBJECT || "https://vitrine.invalid",
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      privateKey: process.env.VAPID_PRIVATE_KEY as string,
    },
    TTL: 60 * 60 * 24,
  };
  return async (subscription, message): Promise<PushResult> => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.key }),
        options,
      );
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? "gone" : "failed";
    }
  };
}
