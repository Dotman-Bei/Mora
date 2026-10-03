import type { Metadata } from "next";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = {
  title: "Activity",
  description: "Everything you've sent through Mora: delivered, waiting, claimed and returned.",
};

export default function ActivityPage() {
  return <ActivityView />;
}
