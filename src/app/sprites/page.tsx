"use client";

// 見比べ用の一時ページ（/sprites）。細かくしたドット絵を、前の絵と並べて確かめる。
// 全キャラクターを描き直したら、このページと Sprite.tsx の owl16 を消す。

import { CLIPS, type Clip, ENTER, type Mood } from "@/components/Scene";
import { type Pose, Sprite, type SpriteName } from "@/components/Sprite";
import { CHARACTERS } from "@/content/world";
import { useEffect, useState } from "react";

const PALETTE = CHARACTERS.hoho.palette;

/** 前の絵（16×16）と新しい絵（32×32） */
const VERSIONS: { name: SpriteName; label: string }[] = [
  { name: "owl16", label: "前 16×16" },
  { name: "owl", label: "新 32×32" },
];

const POSE_LABELS: [Pose | undefined, string][] = [
  [undefined, "ふだん"],
  ["walk1", "歩く1"],
  ["walk2", "歩く2"],
  ["walk3", "歩く3"],
  ["walk4", "歩く4"],
  ["crouch", "かがむ"],
  ["armsUp", "両手を上げる"],
  ["gesture", "身ぶり"],
  ["think", "考える"],
  ["sleep", "眠る"],
  ["sweat", "汗"],
];

/** ゲームの中で出る大きさ（px） */
const SIZES = [24, 32, 36, 44, 48, 56, 72, 88];

const MOOD_LABELS: Record<Mood, string> = {
  talk: "話す",
  think: "考え中",
  oops: "間違い",
  happy: "正解",
  cheer: "昇格",
  sleepy: "閉店後",
};

const SKY = "linear-gradient(#3d5a8a,#7aa0c8 54%,#5a8a4a 55%)";

/** コマの列をくり返し再生する。1周ごとに作り直して、CSS の動き（跳ねる・歩いてくる）も最初からやり直す */
function Player({ name, clip, className = "", talking = false }: { name: SpriteName; clip: Clip; className?: string; talking?: boolean }) {
  // 1周のあとに、元の絵で少し休む
  const steps = [...clip.frames, ...(clip.loop ? [] : [undefined, undefined, undefined, undefined])];
  const [n, setN] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setN((v) => v + 1), clip.ms || 400);
    return () => clearInterval(timer);
  }, [clip.ms]);
  const pose = clip.ms ? steps[n % steps.length] : clip.frames[0];
  return (
    <div key={Math.floor(n / steps.length)} className={className}>
      <Sprite name={name} palette={PALETTE} size={88} pose={pose} talking={talking} animate />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="win mb-4 p-4">
      <h2 className="mb-3 text-lg text-gold">{title}</h2>
      {children}
    </section>
  );
}

export default function SpritesPage() {
  return (
    <main className="mx-auto max-w-7xl p-4">
      <h1 className="mb-4 text-xl">ドット絵の見比べ（一時ページ）</h1>

      <Section title="ふだんの絵">
        <div className="flex flex-wrap gap-6">
          {VERSIONS.map((v) => (
            <figure key={v.name} className="text-center text-sm">
              <div className="rounded p-3" style={{ background: SKY }}>
                <Sprite name={v.name} palette={PALETTE} size={192} />
              </div>
              <figcaption>{v.label}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="ゲームの中で出る大きさ">
        {VERSIONS.map((v) => (
          <div key={v.name} className="mb-2 flex flex-wrap items-end gap-4">
            <span className="w-20 text-sm">{v.label}</span>
            {SIZES.map((size) => (
              <figure key={size} className="text-center text-xs text-dim">
                <Sprite name={v.name} palette={PALETTE} size={size} />
                <figcaption>{size}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </Section>

      <Section title="全ポーズ">
        <p className="mb-2 text-sm text-dim">前の絵には「歩く」「かがむ」のコマがないので、ふだんの絵のままです。</p>
        {VERSIONS.map((v) => (
          <div key={v.name} className="mb-3 flex flex-wrap items-end gap-3">
            <span className="w-full text-sm">{v.label}</span>
            {POSE_LABELS.map(([pose, label]) => (
              <figure key={label} className="text-center text-xs">
                <Sprite name={v.name} palette={PALETTE} size={96} pose={pose} />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </Section>

      <Section title="動き（ゲームと同じコマ送り）">
        {VERSIONS.map((v) => (
          <div key={v.name} className="mb-3 flex flex-wrap items-end gap-3">
            <span className="w-20 text-sm">{v.label}</span>
            <figure className="text-center text-xs">
              <div className="overflow-hidden rounded px-6 pt-4 pb-1" style={{ background: SKY }}>
                <Player name={v.name} clip={ENTER} className="walk-in" />
              </div>
              <figcaption>登場</figcaption>
            </figure>
            {(Object.keys(CLIPS) as Mood[]).map((mood) => (
              <figure key={mood} className="text-center text-xs">
                <div className="overflow-hidden rounded px-6 pt-4 pb-1" style={{ background: SKY }}>
                  <Player name={v.name} clip={CLIPS[mood]} className={mood === "talk" ? "" : `mood-${mood}`} talking={mood === "talk"} />
                </div>
                <figcaption>{MOOD_LABELS[mood]}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </Section>
    </main>
  );
}
