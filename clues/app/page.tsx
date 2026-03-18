import { List } from "@/components/list";
import { Redis } from "@upstash/redis";

export default async function Home() {
  const redis = Redis.fromEnv();
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://sssyyyzzzyyygggyyy.vercel.app"
      : "http://localhost:3000";

  try {
    const phrases = await fetch(`${baseUrl}/api/phrases`, {
      next: { revalidate: 30 },
    }).then((r) => r.json());
    const initialPhrase = phrases[Math.floor(Math.random() * phrases.length)];

    let phoneNumber: string | null = null;
    try {
      const backendUrl = process.env.BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/ready`, {
          next: { revalidate: 30 },
        });
        if (res.ok) {
          phoneNumber = process.env.PHONE_NUMBER ?? null;
        }
      }
    } catch {}

    console.log("phrases!", phrases);
    return <List phrases={phrases} initialPhrase={initialPhrase} phoneNumber={phoneNumber} />;
  } catch (err: any) {
    return <p>fetch failed: {err.toString()}</p>;
  }
}
