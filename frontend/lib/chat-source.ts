export type ChatSource = { key: string; id: string | null; videoId: string | null; video_url: string | null };

export function chatSource(dashboardId: string | null, videoUrl: string | null): ChatSource {
  if (!videoUrl) {
    const id = dashboardId || "1";
    if (id.length > 200) throw new Error("Invalid dashboard ID");
    return { key: `preloaded:${id}`, id, videoId: null, video_url: null };
  }
  let url: URL;
  try { url = new URL(videoUrl); } catch { throw new Error("Provide a supported YouTube URL"); }
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  if (["http:", "https:"].includes(url.protocol)) {
    if (url.hostname === "youtu.be") videoId = parts[0] ?? null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (parts.length === 2 && ["embed", "live", "shorts"].includes(parts[0])) videoId = parts[1];
    }
  }
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Provide a supported YouTube URL");
  return { key: `youtube:${videoId}`, id: null, videoId, video_url: `https://www.youtube.com/watch?v=${videoId}` };
}
