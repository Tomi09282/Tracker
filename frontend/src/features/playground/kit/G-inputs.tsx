import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { CheckMark } from "../../../ui/primitives/CheckMark";
import { Field } from "../../../ui/primitives/Field";
import { NumberStepper } from "../../../ui/primitives/NumberStepper";
import { NumeralField } from "../../../ui/primitives/NumeralField";
import { TextArea } from "../../../ui/primitives/TextArea";

/*
 * The G-inputs gap lane's page of the kit specimen (`/playground`, kit section): the additions to the
 * inputs — `Field unit`, `Field variant="title"`, `TextArea labelTrailing / singleLine` (with the
 * existing `minRows` / `maxRows` / `labelHidden` the frames need), the new `NumeralField` and
 * `NumberStepper controls={false}` — reference `docs/pipeline/pulse/kit/G-inputs.md`.
 *
 * The Figma component board has no cell for any of these (they are the frames' own uses), so every
 * cell is listed after the board, and the first cell of each component is drawn AS ITS FRAME DRAWS
 * IT, at the frame's own x, with the frame's words, so a capture can be laid over the frame's crop:
 * the set rows of workout-1, the amount line of nutrition-2, the plan name of plan-editor-1, the
 * text field of compose-post-1, the headline and the bio of compose-profile-1. The cell after it
 * shows the states: rest, keyboard focus (`data-specimen="focus-…"`: a capture focuses it with the
 * keyboard), error, disabled, empty. A field has no pressed and no busy state (inputs.md).
 *
 * Internal QA page: never translated (check-i18n exempts `features/playground/`). Words: the frames'.
 */

export interface KitSpecimen {
  kit: string;
  label: string;
  node: ReactNode;
  gap?: number;
  w?: number;
}

const Column = ({
  children,
  gap = "gap-6",
}: {
  children: ReactNode;
  gap?: "gap-5" | "gap-6";
}) => <div className={`flex w-[354px] flex-col ${gap}`}>{children}</div>;

/** A specimen's caption — the state it shows (mono, quiet; the host's own mark, not the kit's). */
const State = ({ children }: { children: ReactNode }) => (
  <p className="text-micro text-text-3">{children}</p>
);

/* ── NumeralField: workout-1 `Set list` rows 1-4 (24,357 → 24,617), drawn at the frame's x ──────── */

type SetState = "done" | "active" | "todo";
const SETS: {
  n: number;
  prev: string;
  state: SetState;
  weight: string;
  reps: string;
}[] = [
  { n: 1, prev: "72,5 kg × 8", state: "done", weight: "80", reps: "6" },
  { n: 2, prev: "72,5 kg × 9", state: "done", weight: "80", reps: "6" },
  { n: 3, prev: "72,5 kg × 7", state: "active", weight: "70", reps: "6" },
  { n: 4, prev: "72,5 kg × 7", state: "todo", weight: "70", reps: "6" },
];

/** One set row as the frame lays it out: index 23 / previous 42 / weight 152 / reps 272 / check 328. */
function SetRow({ n, prev, state, weight, reps }: (typeof SETS)[number]) {
  const [w, setW] = useState(state === "done" ? weight : "");
  const [r, setR] = useState(state === "done" ? reps : "");
  const locked = state === "done";
  return (
    // The row's rule is the hairline under its 64 pt box; the fields' line lands on it.
    <div className="flex flex-col">
      <div className="relative h-16 w-[354px]">
        <span
          className={`absolute -left-px top-[35px] text-data-l ${state === "active" ? "text-text-1" : state === "todo" ? "text-text-3" : "text-text-2"}`}
        >
          {n}
        </span>
        <span className="absolute left-[18px] top-[37px] text-data text-text-2">
          {prev}
        </span>
        <NumeralField
          label="Súly"
          className="absolute left-[128px] top-0 w-26"
          placeholder={weight}
          value={w}
          onChange={(e) => setW(e.target.value)}
          locked={locked}
          lockedLabel="Rögzítve"
          data-specimen={n === 3 ? "focus-numeral" : undefined}
        />
        <NumeralField
          label="ism."
          className="absolute left-[248px] top-0 w-10"
          placeholder={reps}
          value={r}
          onChange={(e) => setR(e.target.value)}
          locked={locked}
          lockMark={false}
          lockedLabel="Rögzítve"
        />
        {state !== "active" ? (
          <CheckMark
            done={locked}
            className="absolute left-[304px] top-[10px]"
          />
        ) : null}
      </div>
      <div className="h-px w-[354px] bg-[var(--surface-border)]" />
    </div>
  );
}

function SetRows() {
  return (
    <div className="flex flex-col">
      {SETS.map((s) => (
        <SetRow key={s.n} {...s} />
      ))}
    </div>
  );
}

function NumeralStates() {
  const [long, setLong] = useState("142,5");
  return (
    <Column gap="gap-5">
      <State>
        typed 142,5 (wider than 104 — grows, never cut) · keyboard focus
      </State>
      <NumeralField
        label="Súly"
        className="w-26"
        value={long}
        onChange={(e) => setLong(e.target.value)}
        data-specimen="focus-numeral-long"
      />
      <State>error</State>
      <NumeralField
        label="Súly"
        className="w-26"
        defaultValue="0"
        error="Adj meg egy súlyt"
      />
      <State>disabled · empty (placeholder)</State>
      <div className="flex gap-6">
        <NumeralField
          label="Súly"
          className="w-26"
          defaultValue="80"
          disabled
        />
        <NumeralField label="ism." className="w-10" placeholder="6" />
      </div>
    </Column>
  );
}

/* ── Field unit: nutrition-2 `Field/gramm` (24,699 160 × 62) ──────────────────────────────────────── */

function UnitFields() {
  const [g, setG] = useState("180");
  const ok = /^\d+$/.test(g) && Number(g) > 0;
  return (
    <Column gap="gap-5">
      <Field
        label="gramm"
        unit="g"
        inputMode="numeric"
        value={g}
        onChange={(e) => setG(e.target.value)}
        trailing={
          ok ? (
            <Check aria-hidden className="size-5 stroke-[1.67] text-text-1" />
          ) : undefined
        }
        className="w-40"
        data-specimen="focus-unit"
      />
      <State>error · disabled · empty</State>
      <Field
        label="gramm"
        unit="g"
        inputMode="numeric"
        defaultValue="0"
        error="Adj meg egy mennyiséget"
        className="w-40"
      />
      <Field
        label="gramm"
        unit="g"
        defaultValue="180"
        disabled
        className="w-40"
      />
      <Field label="gramm" unit="g" placeholder="100" className="w-40" />
    </Column>
  );
}

/* ── Field variant="title": plan-editor-1 `Field/Új terv neve` (24,124 354 × 28) ─────────────────── */

function TitleFields() {
  const [name, setName] = useState("Felső/alsó szplit – 12 hetes blokk");
  return (
    <Column gap="gap-6">
      <Field
        variant="title"
        label="Új terv neve"
        maxLength={120}
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-specimen="focus-title"
      />
      <State>long (ellipsis) · error · disabled · empty</State>
      <Field
        variant="title"
        label="Új terv neve"
        defaultValue="Felső/alsó szplit – 12 hetes blokk, haladóknak, heti négy edzéssel"
      />
      <Field
        variant="title"
        label="Új terv neve"
        defaultValue=""
        placeholder="Új terv neve"
        error="Adj nevet a tervnek"
      />
      <Field
        variant="title"
        label="Új terv neve"
        defaultValue="Felső/alsó szplit – 12 hetes blokk"
        disabled
      />
    </Column>
  );
}

/* ── TextArea: compose-post-1 text field, compose-profile-1 headline + bio ───────────────────────── */

const BIO =
  "## Kinek szól\nOlyan felnőtteknek, akik erősebbek akarnak lenni, és közben fájdalom nélkül mozogni.\n\n## Hogyan dolgozom\nHeti két-három edzés, mérhető célok, és minden héten egy rövid visszajelzés.\n\n## Tapasztalat\nTizenkét év edzői munka, rehabilitációs háttérrel.";

function TextAreas() {
  const [body, setBody] = useState(
    "Ma a guggolás volt a fő gyakorlat: öt sorozat, öt ismétlés, és az utolsó kettőnél már érezni kellett a súlyt.\n\nA következő héten 2,5 kilóval emelünk.",
  );
  const [headline, setHeadline] = useState(
    "Erőnléti edző · 12 év tapasztalat · Budapest, XI. kerület",
  );
  const [bio, setBio] = useState(BIO);
  const left = 20000 - body.length;
  return (
    <Column gap="gap-6">
      <TextArea
        label="Szöveg"
        minRows={7}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        labelTrailing={`${left} karakter maradt`}
      />
      <State>
        labelTrailing coloured by the screen: near the cap (warning) · past it
        (danger)
      </State>
      <TextArea
        label="Szöveg"
        minRows={2}
        defaultValue="…"
        labelTrailing={
          <span className="text-warning">412 karakter maradt</span>
        }
      />
      <TextArea
        label="Szöveg"
        minRows={2}
        defaultValue="…"
        labelTrailing={<span className="text-danger">-38 karakter</span>}
        error="Túl hosszú a szöveg"
      />
      <State>
        singleLine: wraps to two rows, Enter does not break it · keyboard focus
      </State>
      <TextArea
        singleLine
        label="Egysoros bemutatkozás"
        marker="Nem kötelező"
        markerTone="quiet"
        hint="Ez jelenik meg a neved alatt a piactéren"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        data-specimen="focus-singleline"
      />
      <State>labelHidden · 8-row window that scrolls (bio)</State>
      <TextArea
        labelHidden
        label="Bemutatkozás"
        minRows={8}
        maxRows={8}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      <State>singleLine disabled</State>
      <TextArea
        singleLine
        label="Egysoros bemutatkozás"
        defaultValue="Erőnléti edző · 12 év tapasztalat"
        disabled
      />
    </Column>
  );
}

/* ── NumberStepper controls={false} ─────────────────────────────────────────────────────────────── */

function Steppers() {
  const [n, setN] = useState<number | null>(70);
  return (
    <Column gap="gap-5">
      <NumberStepper
        label="Egy edzés hossza (perc)"
        value={n}
        onChange={setN}
        min={10}
        max={240}
        step={5}
        valid={n !== null}
        controls={false}
        hint="10 és 240 perc között"
      />
      <NumberStepper
        label="Hetente hány edzés?"
        value={null}
        onChange={() => undefined}
        min={1}
        max={14}
        controls={false}
        error="Adj meg egy számot 1 és 14 között"
      />
    </Column>
  );
}

export const specimens: KitSpecimen[] = [
  {
    kit: "numeralField",
    label:
      "numeralField · workout-1 set rows: done (locked + lock) / active (placeholder) / to do",
    w: 354,
    node: <SetRows />,
  },
  {
    kit: "numeralField",
    label: "numeralField · typed + focus / error / disabled / empty",
    gap: 20,
    node: <NumeralStates />,
  },
  {
    kit: "inputField",
    label: "inputField · unit (nutrition-2 gramm) / error / disabled / empty",
    gap: 20,
    node: <UnitFields />,
  },
  {
    kit: "inputField",
    label: "inputField · title (plan-editor-1) / long / error / disabled",
    gap: 20,
    node: <TitleFields />,
  },
  {
    kit: "textArea",
    label:
      "textArea · labelTrailing (compose-post) / singleLine headline + 8-row bio (compose-profile)",
    gap: 20,
    node: <TextAreas />,
  },
  {
    kit: "numberStepper",
    label:
      "numberStepper · controls={false}: typed figure + tick / empty + error",
    gap: 20,
    node: <Steppers />,
  },
];

export default function GInputsKit() {
  return (
    <div className="flex flex-col gap-12">
      {specimens.map((s, i) => (
        <section key={i} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{s.label}</p>
          {s.node}
        </section>
      ))}
    </div>
  );
}
