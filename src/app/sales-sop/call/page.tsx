import type { Metadata } from "next";
import { getAuthContext } from "@/utils/auth";
import SalesSopClient from "../SalesSopClient";

export const metadata: Metadata = {
  title: "Inbound Qualification Call SOP — Supercraft",
  description:
    "Interactive Standard Operating Procedure and live call assistant for Supercraft Business Development representatives.",
};

export default async function CallSopPage() {
  const auth = await getAuthContext();
  const isSuperadmin = auth?.role === "superadmin";

  return <SalesSopClient isSuperadmin={isSuperadmin} />;
}
