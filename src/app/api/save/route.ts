// クラウド保存。合言葉を知っている本人だけが、1つのセーブを読み書きできる

import { timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";

const KEY = "boki-quest:save";

interface CloudSave {
  savedAt: number;
  state: unknown;
}

let redis: Redis | null = null;
function getRedis(): Redis {
  redis ??= new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
  return redis;
}

/** 合言葉の照合。長さや一致する位置から推測されないよう、一定時間で比べる */
function authorized(req: Request): boolean {
  const expected = process.env.BOKI_PASSCODE;
  const given = req.headers.get("x-passcode");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const unauthorized = () => Response.json({ error: "合言葉が違います" }, { status: 401 });

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const save = await getRedis().get<CloudSave>(KEY);
  return Response.json(save ?? { savedAt: 0, state: null });
}

export async function PUT(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = (await req.json()) as CloudSave;
  if (typeof body.savedAt !== "number" || typeof body.state !== "object" || body.state === null) {
    return Response.json({ error: "セーブの形式が正しくありません" }, { status: 400 });
  }
  // 古い端末からの書き込みで、新しいセーブを上書きしない
  const current = await getRedis().get<CloudSave>(KEY);
  if (current && current.savedAt > body.savedAt) return Response.json({ ok: false, savedAt: current.savedAt }, { status: 409 });
  await getRedis().set(KEY, body);
  return Response.json({ ok: true, savedAt: body.savedAt });
}
