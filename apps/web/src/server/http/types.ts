import type {
  EndpointBody,
  EndpointId,
  EndpointParams,
  EndpointQuery,
  EndpointResult,
  Endpoints,
  User,
} from "@reel/contracts";

/** What every handler receives. Everything here has already been validated against the contract. */
export interface HandlerContext<Id extends EndpointId> {
  request: Request;
  params: EndpointParams<Id>;
  query: EndpointQuery<Id>;
  body: EndpointBody<Id>;
  /** The signed-in user for access "user" endpoints; null otherwise. */
  user: Endpoints[Id]["access"] extends "user" ? User : null;
  /** Next.js after(): local fake imports or bounded hosted-worker wake notification; never real extraction. */
  runAfterResponse: (task: () => Promise<unknown>) => void;
}

export type Handler<Id extends EndpointId> = (ctx: HandlerContext<Id>) => Promise<EndpointResult<Id>>;

export type HandlerMap = { [Id in EndpointId]: Handler<Id> };
