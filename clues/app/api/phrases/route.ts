import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function GET() {
  try {
    const keys = await redis.keys("*");
    return NextResponse.json(keys);
  } catch (error) {
    console.error("Error fetching phrases:", error);
    return NextResponse.json(
      { error: "Failed to fetch phrases" },
      { status: 500 }
    );
  }
}
