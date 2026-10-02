// The Powers-of-Ten readout: scale, what we're looking at, how slowed time is.

import type { Choreography, LevelId } from "./choreography";

const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};
export const sup = (n: number) => String(n).replace(/./g, (c) => SUPERSCRIPT[c] ?? c);

/** What the frame shows, named at the scale we're at. */
export function subject(level: LevelId, L: number, landed: boolean): string {
  switch (level) {
    case "piano":
      if (landed) return "back at the keys";
      return L > -1.0 ? "upright piano" : "a hammer meets its strings";
    case "hammer":
      return "hammer · maple moulding, wool felt";
    case "contact":
      return "felt meets steel · wool fibres a fortieth of a millimetre wide";
    case "pearlite":
      return L > -5.6 ? "piano wire · cold-drawn steel" : "inside the wire · layers of iron and iron carbide";
    case "lattice":
      return "iron crystal · atoms 0.287 nm apart";
    case "atom":
      return "an iron atom · 26 electrons";
    case "nucleus":
      return L > -13.2 ? "the empty atom · its nucleus is 1/30,000 of its width" : "iron-56 nucleus · 26 protons, 30 neutrons";
    case "proton":
      return "a proton · two up quarks and a down, bound by gluons";
  }
}

export class Readout {
  private readonly el: HTMLElement;
  private readonly scale: HTMLElement;
  private readonly name: HTMLElement;
  private readonly time: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "readout";
    this.el.innerHTML = `<div class="scale"></div><div class="name"></div><div class="time"></div>`;
    parent.appendChild(this.el);
    this.scale = this.el.querySelector(".scale")!;
    this.name = this.el.querySelector(".name")!;
    this.time = this.el.querySelector(".time")!;
  }

  update(ch: Choreography, t: number, level: LevelId) {
    const L = ch.L(t);
    const landed = t >= ch.landing;
    const exp = Math.round(L);
    this.scale.textContent = `10${sup(exp)} m`;
    // Chorus 2 lands in the room as the door opens, not on the keys.
    const name = subject(level, L, landed);
    this.name.textContent = landed && "peakBar" in ch.opts.cues ? "back in the room" : name;
    const S = ch.S(t);
    this.time.textContent = S >= 0.5 ? `time slowed 10${sup(Math.round(S))}×` : "";
    // Fade in after the opening beat, out a little after landing.
    const fadeIn = Math.min(Math.max((t - (ch.opts.startTime ?? 0) - 0.4) / 0.8, 0), 1);
    const fadeOut = 1 - Math.min(Math.max((t - ch.landing - 1.6) / 1.2, 0), 1);
    this.el.style.opacity = String(fadeIn * fadeOut);
  }
}
