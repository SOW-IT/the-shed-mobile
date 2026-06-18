/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as bankAccounts from "../bankAccounts.js";
import type * as cleanup from "../cleanup.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as directory from "../directory.js";
import type * as directorySync from "../directorySync.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as importData from "../importData.js";
import type * as importHistory from "../importHistory.js";
import type * as model from "../model.js";
import type * as profile from "../profile.js";
import type * as push from "../push.js";
import type * as reminders from "../reminders.js";
import type * as requests from "../requests.js";
import type * as userLink from "../userLink.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  bankAccounts: typeof bankAccounts;
  cleanup: typeof cleanup;
  comments: typeof comments;
  crons: typeof crons;
  directory: typeof directory;
  directorySync: typeof directorySync;
  emails: typeof emails;
  http: typeof http;
  importData: typeof importData;
  importHistory: typeof importHistory;
  model: typeof model;
  profile: typeof profile;
  push: typeof push;
  reminders: typeof reminders;
  requests: typeof requests;
  userLink: typeof userLink;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
