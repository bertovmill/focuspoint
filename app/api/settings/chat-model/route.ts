import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  CHAT_MODEL_DEFAULT,
  CHAT_MODEL_DEFAULT_PINS,
  CHAT_MODEL_FALLBACK,
  getChatModel,
  getPinnedModels,
  setChatModel,
  setPinnedModels,
} from "@/lib/chat-model";
import { listChatModels } from "@/lib/gateway-catalog";

// Which model Cael runs on, plus which models are pinned to the top of the
// picker. Both are one global setting: agent/model.ts re-reads the selection
// before every model call. `models` is the live AI Gateway catalog, with the
// gateway's own per-1M-token prices.

export async function GET() {
  const models = await listChatModels();
  try {
    const sql = getDb();
    const [model, pinned] = await Promise.all([getChatModel(sql), getPinnedModels(sql)]);
    return NextResponse.json({ model, pinned, models });
  } catch {
    return NextResponse.json({
      model: CHAT_MODEL_DEFAULT,
      pinned: CHAT_MODEL_DEFAULT_PINS,
      models: models.length ? models : CHAT_MODEL_FALLBACK,
    });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const sql = getDb();
    // A PUT carries the model, the pins, or both — the picker sends only what changed.
    const model = "model" in body ? await setChatModel(sql, body.model) : await getChatModel(sql);
    const pinned = "pinned" in body ? await setPinnedModels(sql, body.pinned) : await getPinnedModels(sql);
    return NextResponse.json({ model, pinned });
  } catch {
    return NextResponse.json({ error: "Failed to save the model" }, { status: 500 });
  }
}
