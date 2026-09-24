import { core } from "./locales/ar/core";
import { academic } from "./locales/ar/academic";
import { work } from "./locales/ar/work";
import { system } from "./locales/ar/system";
import { model } from "./locales/ar/model";

/** Arabic dictionary (the default language; right-to-left). */
export const ar = { ...core, ...academic, ...work, ...system, ...model };
