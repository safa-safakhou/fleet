import type { ModelSettings } from "./domain.js";
/** Thinking uses the same accounting and outer deadlines, with bounded generation time. */
export const modelCallBound = (model: ModelSettings) => (model.thinking === true ? 180000 : 90000);
export const modelTurnBound = (model: ModelSettings) => (model.thinking === true ? 360000 : 120000);
