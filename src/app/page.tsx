import { redirect } from "next/navigation";
import { isLocked } from "@/lib/setup-state";

export const dynamic = "force-dynamic";

export default async function Home() {
  const locked = await isLocked();
  redirect(locked ? "/login" : "/setup");
}
