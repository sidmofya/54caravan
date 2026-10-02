// The scale scenes inside the piano, outermost first.
import type { LevelId } from "../choreography";
import type { LevelFactory } from "../film";
import { AtomLevel } from "./atom";
import { ContactLevel } from "./contact";
import { HammerLevel } from "./hammer";
import { LatticeLevel } from "./lattice";
import { NucleusLevel } from "./nucleus";
import { PearliteLevel } from "./pearlite";
import { ProtonLevel } from "./proton";

export const LEVEL_FACTORIES: Partial<Record<LevelId, LevelFactory>> = {
  hammer: ({ ch, renderer }) => new HammerLevel(ch, renderer),
  contact: ({ ch, renderer }) => new ContactLevel(ch, renderer),
  pearlite: ({ ch }) => new PearliteLevel(ch),
  lattice: ({ ch }) => new LatticeLevel(ch),
  atom: ({ ch }) => new AtomLevel(ch),
  nucleus: ({ ch }) => new NucleusLevel(ch),
  proton: ({ ch }) => new ProtonLevel(ch),
};
