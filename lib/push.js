// Server-only web push. VAPID keys are generated once and kept in Supabase, so no env setup is needed.
import webpush from "web-push";
import { getSecret, setSecret } from "@/lib/server";

async function vapid() {
  let v = await getSecret("vapid");
  if (!v?.publicKey) {
    v = webpush.generateVAPIDKeys();
    await setSecret("vapid", v);
  }
  return v;
}

export async function publicKey() {
  return (await vapid()).publicKey;
}

export async function getSubs() {
  return (await getSecret("push-subs")) || [];
}

export async function addSub(sub, device) {
  if (!sub?.endpoint || !sub?.keys?.p256dh) throw new Error("Invalid subscription");
  const subs = (await getSubs()).filter((s) => s.endpoint !== sub.endpoint);
  subs.push({ endpoint: sub.endpoint, keys: sub.keys, device: String(device || "").slice(0, 60), at: new Date().toISOString() });
  await setSecret("push-subs", subs.slice(-10));
}

export async function removeSub(endpoint) {
  await setSecret("push-subs", (await getSubs()).filter((s) => s.endpoint !== endpoint));
}

// Send to every saved device; drop subscriptions the browser has expired
export async function sendAll(payload, origin) {
  const v = await vapid();
  webpush.setVapidDetails(origin || "https://life-tracker.app", v.publicKey, v.privateKey);
  const subs = await getSubs();
  let sent = 0;
  const dead = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
      }
    })
  );
  if (dead.length) await setSecret("push-subs", subs.filter((s) => !dead.includes(s.endpoint)));
  return { sent, total: subs.length };
}
