// src/types/material.ts
//
// Shape of a "material" document. Materials live in the Firestore
// `materials` collection keyed by the material name (the doc id IS the name),
// and are loaded into the app as a map of name -> Material.

import type { STANDARD_LENGTHS } from '../constants/materials';

/** A standard sheet length (96 | 120 | 144). Derived from STANDARD_LENGTHS. */
export type StandardLength = (typeof STANDARD_LENGTHS)[number];

export interface Material {
  /** Firestore doc id — identical to `name`. */
  id: string;
  /** Material name, e.g. "16ga CRS". The doc id. */
  name: string;
  /** Category this material is grouped under, e.g. "Cold Rolled". */
  category?: string;
  /** Sheet thickness in inches. Used for weight/cost math. */
  thickness: number;
  /** Density in lbs/in³. Used together with thickness to weigh a sheet. */
  density: number;
  /** Optional per-category indicator/threshold settings (reorder UI). */
  indicatorSettings?: Record<string, unknown>;
}

/** The materials map as held in React state: name -> Material. */
export type MaterialsMap = Record<string, Material>;
