export const savedNote = ({ signedIn, offline }: { signedIn: boolean; offline: boolean }) => {
  if (!signedIn) return "Saved on this device. Sign in and it goes on the leaderboard.";
  return offline ? "Saved. It goes on the leaderboard when you're online." : "Saved to the leaderboard.";
};
