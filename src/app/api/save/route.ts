// クラウド保存。合言葉を知っている本人だけが、1つのセーブを読み書きできる。
// セーブ本体は端末側で圧縮した文字列のまま預かり、版（保存時刻）は別のキーで持つ。

import { timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";

const KEY = "boki-quest:save";
const KEY_AT = "boki-quest:save:at";
/** Upstash の1リクエストの上限（1MB）に余裕を持たせた、セーブ本体の上限 */
const MAX_BYTES = 900_000;

let redis: Redis | null = null;
function getRedis(): Redis {
  redis ??= new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
  return redis;
}

/** 合言葉の照合。一致する位置から推測されないよう、一定時間で比べる */
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
  const [data, savedAt] = await getRedis().mget<[string | null, number | null]>(KEY, KEY_AT);
  return Response.json({ savedAt: savedAt ?? 0, data });
}

/**
 * 保存する。base は、その端末が最後に読み書きしたときの版。
 * そのあとで別の端末が保存していたら（クラウドの版のほうが新しければ）上書きせず 409 を返す。
 */
export async function PUT(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = (await req.json()) as { base?: unknown; data?: unknown };
  if (typeof body.base !== "number" || typeof body.data !== "string" || body.data.length > MAX_BYTES) {
    return Response.json({ error: "セーブの形式が正しくありません" }, { status: 400 });
  }
  const current = (await getRedis().get<number>(KEY_AT)) ?? 0;
  if (current > body.base) return Response.json({ savedAt: current }, { status: 409 });
  // 版はサーバーの時刻で付ける（端末ごとの時計のずれに左右されない）
  const savedAt = Math.max(Date.now(), current + 1);
  await getRedis().mset({ [KEY]: body.data, [KEY_AT]: savedAt });
  return Response.json({ savedAt });
}
