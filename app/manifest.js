export default function manifest() {
  return {
    name: "Life Tracker",
    short_name: "Life",
    description: "Studies, schedule, minimums, reading, sport, food and money in one place.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#121722",
    theme_color: "#2B44B8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log food", url: "/?tab=food", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ask coach", url: "/?tab=coach", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
