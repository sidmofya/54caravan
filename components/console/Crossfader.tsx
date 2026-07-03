"use client";

interface Props {
  value: number;
  onChange: (value: number) => void;
}

export default function Crossfader({ value, onChange }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xs">
      <p
        className="text-[10px] tracking-[0.35em] uppercase"
        style={{ color: "var(--route-console-charcoal)" }}
      >
        A&nbsp;&nbsp;&nbsp;&nbsp;Crossfade&nbsp;&nbsp;&nbsp;&nbsp;B
      </p>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        aria-label="Crossfader"
      />
    </div>
  );
}
