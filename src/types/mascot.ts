export type MascotType = "duck" | "cat";

export type MascotMood = "sunny" | "rain" | "flood" | "sleep";

export interface UserSavedLocation {
  lat: number;
  lng: number;
  updatedAt: number;
}

export interface MascotQuote {
  text: string;
  mood?: MascotMood;
  timeSlot?: "morning" | "noon" | "rush_hour_5pm" | "evening" | "night" | "any";
}
