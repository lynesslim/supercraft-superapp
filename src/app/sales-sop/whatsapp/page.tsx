import type { Metadata } from "next";
import { getAuthContext } from "@/utils/auth";
import WhatsAppSopClient from "./WhatsAppSopClient";

export const metadata: Metadata = {
  title: "WhatsApp Inbound Lead Reply SOP — Supercraft",
  description:
    "Interactive Standard Operating Procedure for WhatsApp-first lead responses, contact attempts, qualification, meeting conversion & follow-ups.",
};

export default async function WhatsAppSopPage() {
  const auth = await getAuthContext();
  const isSuperadmin = auth?.role === "superadmin";

  return <WhatsAppSopClient isSuperadmin={isSuperadmin} />;
}
