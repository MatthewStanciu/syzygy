import { List } from "@/components/list";
import { Redis } from "@upstash/redis";

export default async function Home() {
  const redis = Redis.fromEnv();
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://92e90cff4313.ngrok-free.app"
      : "http://localhost:3001";

  const phrases = await fetch(`${baseUrl}/api/phrases`, {
    next: { revalidate: 30 },
  }).then((r) => r.json());
  console.log("phrases!", phrases);

  return <List phrases={phrases} />;
}
