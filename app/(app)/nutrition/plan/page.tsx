import { redirect } from "next/navigation";

// The meal plan moved to its own tab at /meals (2026-09-27); old links land there.
export default function Page() {
  redirect("/meals");
}
