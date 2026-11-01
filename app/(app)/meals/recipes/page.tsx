import { redirect } from "next/navigation";

// The recipe box became the Meals page itself (2026-11-01); old links land there.
export default function Page() {
  redirect("/meals");
}
