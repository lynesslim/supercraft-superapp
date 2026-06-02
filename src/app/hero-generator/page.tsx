import type { Metadata } from "next";
import { getAuthContext } from "@/utils/auth";
import HeroGeneratorClient from "./HeroGeneratorClient";

export const metadata: Metadata = {
  title: "Hero Section Mockup Generator | Supercraft",
  description: "Generate and save premium visual hero section mockups for your active projects.",
};

export default async function Page() {
  await getAuthContext(); // Validate session authentication on load
  return <HeroGeneratorClient />;
}
