"use client";

// 確認用の一時ページ（/sprites）。細かくしたドット絵と、増やしたコマを並べて確かめる。
// 確認が済んだら、このページと Scene.tsx の CLIPS・ENTER・Clip の export を消す。

import { CLIPS, type Clip, ENTER, type Mood, Scene } from "@/components/Scene";
import type { Pose } from "@/components/Sprite";
import { Btn, Portrait } from "@/components/ui";
import { CHARACTERS } from "@/content/world";
import { initialState } from "@/game/logic";
import type { CharacterId } from "@/game/types";
import { useEffect, useState } from "react";

const EVERYONE = Object.keys(CHARACTERS) as CharacterId[];

/** 絵の種類ごとに1人ずつ（フクロウ・人・ドワーフ・妖精） */
const CAST: CharacterId[] = ["hoho", "cecil", "gantetsu", "pipi"];

const POSE_GROUPS: [string, (Pose | undefined)[]][] = [
  ["歩く（8コマ）", ["walk1", "walk2", "walk3", "walk4", "walk5", "walk6", "walk7", "walk8"]],
  ["かがむ → 跳ぶ", [undefined, "crouch1", "crouch2", "jump1", "jump2", "jump3"]],
  ["話す身ぶり", [undefined, "talk1", "talk2"]],
  ["考える", ["think1", "think2", "think3"]],
  ["眠る", ["sleep1", "sleep2", "sleep3", "sleep4"]],
  ["あわてる", ["oops1", "oops2", "oops3"]],
];

/** ゲームの中で出る大きさ（px） */
const SIZES = [32, 48, 64, 96];

const MOOD_LABELS: Record<Mood, string> = {
  talk: "話す",
  think: "考え中",
  oops: "間違い",
  happy: "正解",
  cheer: "昇格",
  sleepy: "閉店後",
};

const SHOP = initialState("ためし");

const SKY = "linear-gradient(#3d5a8a,#7aa0c8 54%,#5a8a4a 55%)";

/** コマの列をくり返し再生する。1周ごとに作り直して、CSS の動き（跳ねる・歩いてくる）も最初からやり直す */
function Player({ id, clip, className = "", talking = false }: { id: CharacterId; clip: Clip; className?: string; talking?: boolean }) {
  // くり返さない動きは、1周のあとに最後のコマのまま少し休む
  const length = clip.frames.length + (clip.loop ? 0 : Math.ceil(700 / clip.ms));
  const [n, setN] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setN((v) => v + 1), clip.ms);
    return () => clearInterval(timer);
  }, [clip.ms]);
  const pose = clip.frames[Math.min(n % length, clip.frames.length - 1)];
  return (
    <div key={Math.floor(n / length)} className={className}>
      <Portrait id={id} size={96} pose={pose} talking={talking} />
    </div>
  );
}

/** 店の場面で、話し手と動きを選んで確かめる */
function ShopStage() {
  const [speaker, setSpeaker] = useState<CharacterId | undefined>("cecil");
  const [fx, setFx] = useState<{ mood?: Mood; moodKey: number }>({ moodKey: 0 });
  return (
    <div className="max-w-xl">
      <Scene state={SHOP} speaker={speaker} time="day" fx={fx} />
      <div className="mt-2 flex flex-wrap gap-1">
        <Btn variant="chip" sound={null} active={!speaker} onClick={() => setSpeaker(undefined)}>
          話し手なし（棚の上の師匠が動く）
        </Btn>
        {CAST.map((id) => (
          <Btn key={id} variant="chip" sound={null} active={speaker === id} onClick={() => setSpeaker(id)}>
            {CHARACTERS[id].name}
          </Btn>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {(Object.keys(CLIPS) as Mood[]).map((mood) => (
          <Btn key={mood} variant="chip" sound={null} active={fx.mood === mood} onClick={() => setFx((v) => ({ mood, moodKey: v.moodKey + 1 }))}>
            {MOOD_LABELS[mood]}
          </Btn>
        ))}
      </div>
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

function Stage({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="text-center text-xs">
      <div className="overflow-hidden rounded px-6 pt-6 pb-1" style={{ background: SKY }}>
        {children}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function SpritesPage() {
  return (
    <main className="mx-auto max-w-7xl p-4">
      <h1 className="mb-4 text-xl">ドット絵の確認（一時ページ）</h1>

      <Section title="全員（待機の息づかい・まばたきつき）">
        <div className="flex flex-wrap items-end gap-4 rounded p-4" style={{ background: SKY }}>
          {EVERYONE.map((id) => (
            <figure key={id} className="text-center text-xs text-white">
              <Portrait id={id} size={96} />
              <figcaption>{CHARACTERS[id].name}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="ゲームの中で出る大きさ">
        <div className="flex flex-wrap items-end gap-8">
          {CAST.map((id) => (
            <div key={id} className="flex items-end gap-3">
              {SIZES.map((size) => (
                <figure key={size} className="text-center text-xs text-dim">
                  <Portrait id={id} size={size} still />
                  <figcaption>{size}</figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="動き（ゲームと同じコマ送り）">
        {CAST.map((id) => (
          <div key={id} className="mb-3 flex flex-wrap items-end gap-3">
            <Stage label="登場">
              <Player id={id} clip={ENTER} className="walk-in" />
            </Stage>
            {(Object.keys(CLIPS) as Mood[]).map((mood) => (
              <Stage key={mood} label={MOOD_LABELS[mood]}>
                <Player id={id} clip={CLIPS[mood]} className={mood === "talk" ? "" : `mood-${mood}`} talking={mood === "talk"} />
              </Stage>
            ))}
          </div>
        ))}
      </Section>

      <Section title="店の場面（ボタンで話し手と動きを切り替え）">
        <ShopStage />
      </Section>

      <Section title="全コマ">
        <p className="mb-2 text-sm text-dim">妖精は飛んでいるので、歩くコマはありません（ふだんの絵のまま）。</p>
        {CAST.map((id) => (
          <div key={id} className="mb-4">
            <h3 className="mb-1 text-sm">{CHARACTERS[id].name}</h3>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              {POSE_GROUPS.map(([label, poses]) => (
                <figure key={label} className="text-xs">
                  <div className="flex items-end rounded px-1 pt-2" style={{ background: SKY }}>
                    {poses.map((pose, i) => (
                      <Portrait key={i} id={id} size={64} pose={pose} still />
                    ))}
                  </div>
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </main>
  );
}
