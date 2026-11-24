import { safeReturnPath } from "@/lib/safeRoute";

export const SIGNUP_LABEL = "Регистрирайте се безплатно";
export const REGISTRATION_DISMISS_KEY = "funnel_sticky_dismissed_v2";

/** Keep the intended product/workflow; never create an auth-to-auth loop. */
export function registrationTarget(destination: string = "/build"): string {
  const safe = safeReturnPath(destination, "/build");
  const target = /^\/auth(?:[/?]|$)/.test(safe) ? "/build" : safe;
  return `/auth?tab=signup&redirect=${encodeURIComponent(target)}`;
}

export interface InvitationState {
  anonymous: boolean;
  ready: boolean;
  home: boolean;
  dismissed: boolean;
  engaged: boolean;
  heroPassed: boolean;
  competingAction: boolean;
  busy: boolean;
}

export function shouldShowRegistrationInvitation(state: InvitationState): boolean {
  return state.anonymous && state.ready && state.home && !state.dismissed &&
    state.engaged && state.heroPassed && !state.competingAction && !state.busy;
}