"use client";

import { useState } from "react";
import { Play } from "../icons";

const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
const YOUTUBE_PATTERN =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|embed\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+[^\s]*/gi;
const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
];
const SPOTIFY_PATTERN =
  /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|album|playlist|episode|show)\/[a-zA-Z0-9]+[^\s]*/gi;

function youtubeId(url: string): string | null {
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function spotifyEmbed(url: string): { type: string; id: string } | null {
  const match = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|episode|show)\/([a-zA-Z0-9]{22})/,
  );
  return match ? { type: match[1], id: match[2] } : null;
}

function LinkifiedText({ text }: { text: string }) {
  return (
    <p className="text-white whitespace-pre-wrap">
      {text.split(URL_PATTERN).map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            {part}
          </a>
        ) : (
          part && <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

function YouTubeEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative aspect-video rounded-lg overflow-hidden bg-black group cursor-pointer w-full"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail with an onError fallback */}
      <img
        src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
        alt="YouTube video thumbnail"
        className="w-full h-full object-cover"
        onError={(event) => {
          const img = event.currentTarget;
          if (img.src.includes("maxresdefault")) img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }}
      />
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
        </div>
      </div>
    </button>
  );
}

function SpotifyEmbed({ type, id }: { type: string; id: string }) {
  return (
    <div className="rounded-lg overflow-hidden bg-black">
      <iframe
        src={`https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`}
        width="100%"
        height={type === "track" || type === "episode" ? 152 : 352}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title={`Spotify ${type}`}
        style={{ border: 0 }}
      />
    </div>
  );
}

/** Post body: YouTube and Spotify links become embeds, other URLs become links. */
export function PostContent({ content }: { content: string }) {
  const youtube = (content.match(YOUTUBE_PATTERN) ?? []).flatMap((url) => {
    const videoId = youtubeId(url);
    return videoId ? [{ url, videoId }] : [];
  });
  const spotify = (content.match(SPOTIFY_PATTERN) ?? []).flatMap((url) => {
    const embed = spotifyEmbed(url);
    return embed ? [{ url, ...embed }] : [];
  });
  if (youtube.length === 0 && spotify.length === 0) return <LinkifiedText text={content} />;

  let text = content;
  [...youtube, ...spotify].forEach(({ url }) => {
    text = text.replace(url, "").trim();
  });
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return (
    <div className="space-y-3">
      {youtube.map(({ videoId }, index) => (
        <YouTubeEmbed key={`yt-${videoId}-${index}`} videoId={videoId} />
      ))}
      {spotify.map(({ type, id }, index) => (
        <SpotifyEmbed key={`sp-${id}-${index}`} type={type} id={id} />
      ))}
      {text && <LinkifiedText text={text} />}
    </div>
  );
}
