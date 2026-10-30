import { NextResponse } from "next/server";
import { isAuthed, verifyState } from "@/lib/server";
import { PROVIDERS, finishConnect } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (q) => NextResponse.redirect(`${url.origin}/?tab=settings&${q}`);
  if (!PROVIDERS[provider]) return back(`connect_error=${encodeURIComponent("Unknown provider")}`);
  if (!(await isAuthed())) return back(`connect_error=${encodeURIComponent("Your tracker session wasn't found. Connect from the device you're signed in on.")}`);
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return back(`connect_error=${encodeURIComponent(err)}`);
  if (!(await verifyState(url.searchParams.get("state"), provider))) return back(`connect_error=${encodeURIComponent("The sign-in took too long. Try connecting again.")}`);
  try {
    await finishConnect(provider, url.origin, url.searchParams.get("code"));
    return back(`connected=${provider}`);
  } catch (e) {
    return back(`connect_error=${encodeURIComponent(String(e.message || e))}`);
  }
}
