import { dispatchBuffered } from "@/lib/bufferedEvents";

export const START_STORY_EVENT = "dogovori:start-story";
export function openStartStory() {
  dispatchBuffered(START_STORY_EVENT);
}