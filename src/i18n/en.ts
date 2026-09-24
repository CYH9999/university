import { core } from "./locales/en/core";
import { academic } from "./locales/en/academic";
import { work } from "./locales/en/work";
import { system } from "./locales/en/system";
import { model } from "./locales/en/model";

/** English dictionary (the fallback language). */
export const en = { ...core, ...academic, ...work, ...system, ...model };
