import type { HandlerMap } from "../http/types";
import { authHandlers } from "./auth";
import { inspirationHandlers } from "./inspirations";
import { itineraryHandlers } from "./itinerary";
import { jobHandlers } from "./jobs";
import { placeHandlers } from "./places";
import { sharingHandlers } from "./sharing";
import { tripHandlers } from "./trips";

/**
 * Every endpoint in packages/contracts must have exactly one handler.
 * Adding an endpoint without a handler, or returning the wrong shape, is a type error here.
 */
export const handlers: HandlerMap = {
  ...authHandlers,
  ...tripHandlers,
  ...inspirationHandlers,
  ...placeHandlers,
  ...itineraryHandlers,
  ...sharingHandlers,
  ...jobHandlers,
};
