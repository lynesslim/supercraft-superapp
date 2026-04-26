import { requirePageRole } from "@/utils/auth";
import PlaygroundClient from "./PlaygroundClient";

export default async function PlaygroundPage() {
  await requirePageRole(["superadmin"]);

  return <PlaygroundClient />;
}
