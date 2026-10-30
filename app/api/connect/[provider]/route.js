import { NextResponse } from "next/server";
import { isAuthed, setSecret, signState } from "@/lib/server";
import { PROVIDERS, authorizeUrl, configured } from "@/lib/integrations";

export const dynamic = "force-dynamic";

// GET /api/connect/google|microsoft -> sends you to the provider's sign-in page
export async function GET(req, { params }) {
  const { provider } = await params;
  const origin = new URL(req.url).origin;
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (!(await isAuthed())) return NextResponse.redirect(`${origin}/?connect_error=${encodeURIComponent("Sign in to the tracker first.")}`);
  if (!(await configured(provider)))
    return NextResponse.redirect(`${origin}/?tab=settings&connect_error=${encodeURIComponent(`${PROVIDERS[provider].name} isn't set up yet. Add its client ID and secret under Settings → Connections.`)}`);
  return NextResponse.redirect(await authorizeUrl(provider, origin, await signState(provider)));
}

// DELETE /api/connect/google|microsoft -> forget the stored tokens
export async function DELETE(req, { params }) {
  const { provider } = await params;
  if (!(await isAuthed())) return NextResponse.json({ error: "locked" }, { status: 401 });
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  await setSecret(provider, null);
  return NextResponse.json({ ok: true });
}
