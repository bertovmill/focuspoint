import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  CHAT_MODEL_DEFAULT,
  CHAT_MODEL_TIERS,
  getChatModel,
  setChatModel,
} from "@/lib/chat-model";

// Which model Cael runs on, set from the chat bar's picker. One global setting:
// agent/model.ts re-reads it before every model call.

export async function GET() {
  try {
    const model = await getChatModel(getDb());
    return NextResponse.json({ model, tiers: CHAT_MODEL_TIERS });
  } catch {
    return NextResponse.json({ model: CHAT_MODEL_DEFAULT, tiers: CHAT_MODEL_TIERS });
  }
}

export async function PUT(req: Request) {
  try {
    const { model } = await req.json();
    const saved = await setChatModel(getDb(), model);
    return NextResponse.json({ model: saved, tiers: CHAT_MODEL_TIERS });
  } catch {
    return NextResponse.json({ error: "Failed to save the model" }, { status: 500 });
  }
}
