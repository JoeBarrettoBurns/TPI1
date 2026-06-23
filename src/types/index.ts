// src/types/index.ts
//
// Barrel for the domain model. Import from here, e.g.
//   import type { Sheet, LiveSheet, UsageLog, Material } from '../types';

export type {
  SheetStatus,
  Sheet,
  LiveSheet,
  UsedSheetSnapshot,
} from './inventory';

export type {
  UsageLogStatus,
  UsageLog,
} from './usageLog';

export type {
  StandardLength,
  Material,
  MaterialsMap,
} from './material';
