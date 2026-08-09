import { NextResponse } from "next/server";
import { fetchLumaContacts } from "@/lib/luma";

export async function GET() {
  try {
    const contacts = await fetchLumaContacts();
    return NextResponse.json(contacts.map((c) => ({ created_at: c.created_at })));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
