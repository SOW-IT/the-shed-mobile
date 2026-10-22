/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as announcementData from "../announcementData.js";
import type * as announcements from "../announcements.js";
import type * as appErrors from "../appErrors.js";
import type * as appInstalls from "../appInstalls.js";
import type * as appleIdentity from "../appleIdentity.js";
import type * as appleRevoke from "../appleRevoke.js";
import type * as attendance from "../attendance.js";
import type * as attendanceAudit from "../attendanceAudit.js";
import type * as attendanceCounts from "../attendanceCounts.js";
import type * as attendanceExport from "../attendanceExport.js";
import type * as attendanceMembers from "../attendanceMembers.js";
import type * as attendanceMetadata from "../attendanceMetadata.js";
import type * as attendanceMetrics from "../attendanceMetrics.js";
import type * as attendanceTags from "../attendanceTags.js";
import type * as auth from "../auth.js";
import type * as avatars from "../avatars.js";
import type * as bankAccounts from "../bankAccounts.js";
import type * as checkIn from "../checkIn.js";
import type * as churches from "../churches.js";
import type * as cleanup from "../cleanup.js";
import type * as comments from "../comments.js";
import type * as contact from "../contact.js";
import type * as crons from "../crons.js";
import type * as designRequestComments from "../designRequestComments.js";
import type * as designRequestData from "../designRequestData.js";
import type * as designRequestForm from "../designRequestForm.js";
import type * as designRequestImport from "../designRequestImport.js";
import type * as designRequests from "../designRequests.js";
import type * as directory from "../directory.js";
import type * as directorySync from "../directorySync.js";
import type * as emails from "../emails.js";
import type * as eventRequestAccess from "../eventRequestAccess.js";
import type * as eventRequestComments from "../eventRequestComments.js";
import type * as eventRequestData from "../eventRequestData.js";
import type * as eventRequestForm from "../eventRequestForm.js";
import type * as eventRequests from "../eventRequests.js";
import type * as eventSubForms from "../eventSubForms.js";
import type * as events from "../events.js";
import type * as generalMetrics from "../generalMetrics.js";
import type * as homeContent from "../homeContent.js";
import type * as homeData from "../homeData.js";
import type * as http from "../http.js";
import type * as memberPairSuggestions from "../memberPairSuggestions.js";
import type * as memberRepair from "../memberRepair.js";
import type * as memberRoles from "../memberRoles.js";
import type * as mentoring from "../mentoring.js";
import type * as mentoringImport from "../mentoringImport.js";
import type * as mergeSuggestions from "../mergeSuggestions.js";
import type * as metricsData from "../metricsData.js";
import type * as model from "../model.js";
import type * as notifications from "../notifications.js";
import type * as pagination from "../pagination.js";
import type * as photo from "../photo.js";
import type * as presence from "../presence.js";
import type * as profile from "../profile.js";
import type * as push from "../push.js";
import type * as reminders from "../reminders.js";
import type * as requests from "../requests.js";
import type * as rollCallOrder from "../rollCallOrder.js";
import type * as rosterHistory from "../rosterHistory.js";
import type * as sowInsights from "../sowInsights.js";
import type * as staffLeavers from "../staffLeavers.js";
import type * as staffMembers from "../staffMembers.js";
import type * as stepTiming from "../stepTiming.js";
import type * as storageBackup from "../storageBackup.js";
import type * as userLink from "../userLink.js";
import type * as waitingOnMe from "../waitingOnMe.js";
import type * as weeklyInsights from "../weeklyInsights.js";
import type * as weeklyInsightsData from "../weeklyInsightsData.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  announcementData: typeof announcementData;
  announcements: typeof announcements;
  appErrors: typeof appErrors;
  appInstalls: typeof appInstalls;
  appleIdentity: typeof appleIdentity;
  appleRevoke: typeof appleRevoke;
  attendance: typeof attendance;
  attendanceAudit: typeof attendanceAudit;
  attendanceCounts: typeof attendanceCounts;
  attendanceExport: typeof attendanceExport;
  attendanceMembers: typeof attendanceMembers;
  attendanceMetadata: typeof attendanceMetadata;
  attendanceMetrics: typeof attendanceMetrics;
  attendanceTags: typeof attendanceTags;
  auth: typeof auth;
  avatars: typeof avatars;
  bankAccounts: typeof bankAccounts;
  checkIn: typeof checkIn;
  churches: typeof churches;
  cleanup: typeof cleanup;
  comments: typeof comments;
  contact: typeof contact;
  crons: typeof crons;
  designRequestComments: typeof designRequestComments;
  designRequestData: typeof designRequestData;
  designRequestForm: typeof designRequestForm;
  designRequestImport: typeof designRequestImport;
  designRequests: typeof designRequests;
  directory: typeof directory;
  directorySync: typeof directorySync;
  emails: typeof emails;
  eventRequestAccess: typeof eventRequestAccess;
  eventRequestComments: typeof eventRequestComments;
  eventRequestData: typeof eventRequestData;
  eventRequestForm: typeof eventRequestForm;
  eventRequests: typeof eventRequests;
  eventSubForms: typeof eventSubForms;
  events: typeof events;
  generalMetrics: typeof generalMetrics;
  homeContent: typeof homeContent;
  homeData: typeof homeData;
  http: typeof http;
  memberPairSuggestions: typeof memberPairSuggestions;
  memberRepair: typeof memberRepair;
  memberRoles: typeof memberRoles;
  mentoring: typeof mentoring;
  mentoringImport: typeof mentoringImport;
  mergeSuggestions: typeof mergeSuggestions;
  metricsData: typeof metricsData;
  model: typeof model;
  notifications: typeof notifications;
  pagination: typeof pagination;
  photo: typeof photo;
  presence: typeof presence;
  profile: typeof profile;
  push: typeof push;
  reminders: typeof reminders;
  requests: typeof requests;
  rollCallOrder: typeof rollCallOrder;
  rosterHistory: typeof rosterHistory;
  sowInsights: typeof sowInsights;
  staffLeavers: typeof staffLeavers;
  staffMembers: typeof staffMembers;
  stepTiming: typeof stepTiming;
  storageBackup: typeof storageBackup;
  userLink: typeof userLink;
  waitingOnMe: typeof waitingOnMe;
  weeklyInsights: typeof weeklyInsights;
  weeklyInsightsData: typeof weeklyInsightsData;
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
