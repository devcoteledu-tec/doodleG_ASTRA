// Central place for all of doodle_G's real social media profile links.
// Update the URLs here and every footer, nav, and social page picks up the change.
export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/doodle_g_?igsh=NnIzYW55dGR6MjV5',
  youtube: 'https://youtube.com/@doodle_g_ind?si=Jt6X6ngsnwBH1vJ8',
  x: 'https://x.com/DoodleG26',
  facebook: 'https://www.facebook.com/profile.php?id=doodleg',
} as const;

export type SocialPlatform = keyof typeof SOCIAL_LINKS;
