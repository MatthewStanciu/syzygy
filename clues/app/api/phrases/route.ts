import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function GET() {
  try {
    const keys = (await redis.keys("*")).filter((key) => key !== "flags");
    const values = await redis.mget(...keys)

    const availableKeys = keys.filter((_, i) => {
      const value = values[i];
      return !(
        typeof value === 'string' && !Number.isNaN(Date.parse(value))
      )
    })

    return NextResponse.json(availableKeys);
  } catch (error) {
    console.error("Error fetching phrases:", error);
    return NextResponse.json(
      { error: "Failed to fetch phrases" },
      { status: 500 }
    );
  }
}
