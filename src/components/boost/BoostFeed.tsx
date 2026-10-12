"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Globe, Handshake, Loader2, Lock, Paperclip, Send, Sparkles, Trash2, X } from "../icons";
import { hotkeyHint } from "../focus/GoalForm";
import { useHotkey, useHotkeyLabel } from "../hotkeys/HotkeysProvider";
import { getDisplayName } from "../lib/profile";
import { getLocalUserId, localDb, type Row } from "../lib/local-db";
import { PostContent } from "./PostContent";
import { useDialog } from "../dialogs/DialogProvider";

type BoostPost = Row & {
  user_id: string;
  display_name: string | null;
  content: string | null;
  is_public: boolean;
  post_type: "text" | "photo" | "video";
  video_url: string | null;
  image_url: string | null;
  workflow_generated: boolean;
};

type LikeRow = Row & { post_id: string; user_id: string };
type LikeState = { count: number; isLiked: boolean };
type MediaKind = "image" | "video";

const PAGE_SIZE = 50;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MEDIA = "video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/gif,image/webp";
const NO_LIKES: LikeState = { count: 0, isLiked: false };
const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86400;
const WEEK_S = 604800;

function formatPostDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  const relative = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" });
  if (abs < MINUTE_S) return relative.format(Math.round(seconds), "second");
  if (abs < HOUR_S) return relative.format(Math.round(seconds / MINUTE_S), "minute");
  if (abs < DAY_S) return relative.format(Math.round(seconds / HOUR_S), "hour");
  if (abs < WEEK_S) return relative.format(Math.round(seconds / DAY_S), "day");
  return new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium" }).format(date);
}

async function loadLikes(postIds: readonly string[], userId: string): Promise<Map<string, LikeState>> {
  const { data } = await localDb.from<LikeRow>("boost_post_likes").select("*").in("post_id", postIds);
  const likes = new Map<string, LikeState>(postIds.map((id) => [id, { count: 0, isLiked: false }]));
  (data ?? []).forEach((like) => {
    const state = likes.get(like.post_id);
    if (!state) return;
    likes.set(like.post_id, { count: state.count + 1, isLiked: state.isLiked || like.user_id === userId });
  });
  return likes;
}

function isPortraitVideo(video: HTMLVideoElement): boolean {
  return video.videoHeight > video.videoWidth;
}

function UploadedVideo({ src }: { src: string }) {
  const [portrait, setPortrait] = useState(false);
  return (
    <div className="mb-3 rounded-lg overflow-hidden bg-black w-full">
      <video
        src={src}
        className={`max-h-[500px] object-contain ${portrait ? "mx-auto" : "w-full"}`}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => setPortrait(isPortraitVideo(event.currentTarget))}
      />
    </div>
  );
}

function UploadedPhoto({ src }: { src: string }) {
  return (
    <div className="mb-3 rounded-lg overflow-hidden bg-black w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads are object URLs */}
      <img src={src} className="max-h-[500px] w-full object-contain" alt="Boost post" />
    </div>
  );
}

export function BoostFeed() {
  const dialog = useDialog();
  const [posts, setPosts] = useState<BoostPost[]>([]);
  const [likes, setLikes] = useState(new Map<string, LikeState>());
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [previewPortrait, setPreviewPortrait] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useHotkey("list.new", () => composerRef.current?.focus());
  useHotkey("boost.post", () => formRef.current?.requestSubmit());
  useHotkey("boost.attach", () => fileInputRef.current?.click());
  useHotkey("boost.visibility", () => setIsPublic((current) => !current), !loading);
  const visibilityCombo = useHotkeyLabel("boost.visibility");
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const currentUserId = getLocalUserId();
    setUserId(currentUserId);
    (async () => {
      try {
        const { data } = await localDb
          .from<BoostPost>("boost_posts")
          .select("*")
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1);
        const rows = data ?? [];
        setPosts(rows);
        if (rows.length > 0) setLikes(await loadLikes(rows.map((post) => post.id), currentUserId));
      } catch (error) {
        console.error("Error loading posts:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectMedia = (file: File) => {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) return;
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      void dialog.alert("Video must be smaller than 100MB");
      return;
    }
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      void dialog.alert("Image must be smaller than 10MB");
      return;
    }
    setMediaFile(file);
    setMediaKind(isVideo ? "video" : "image");
    setMediaPreview(URL.createObjectURL(file));
    setPreviewPortrait(false);
  };

  // The preview URL is not revoked once posted: the new post keeps showing it for the session.
  const clearMedia = (revoke: boolean) => {
    if (revoke && mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaKind(null);
    setMediaPreview(null);
    setPreviewPortrait(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current++;
    if (event.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current--;
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) selectMedia(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if ((!content.trim() && !mediaFile) || submitting || !userId) return;
    try {
      setSubmitting(true);
      // ponytail: object URLs die on reload; persist uploads (IndexedDB) if media must survive a refresh.
      const { data: post, error } = await localDb
        .from<BoostPost>("boost_posts")
        .insert({
          user_id: userId,
          display_name: getDisplayName() || null,
          content: content.trim() || null,
          is_public: isPublic,
          post_type: mediaKind === "video" ? "video" : mediaKind === "image" ? "photo" : "text",
          video_url: mediaKind === "video" ? mediaPreview : null,
          image_url: mediaKind === "image" ? mediaPreview : null,
          workflow_generated: false,
        })
        .select()
        .single();
      if (error || !post) throw new Error(`Failed to create boost post: ${error?.message}`);
      setPosts([post, ...posts]);
      setLikes(new Map(likes).set(post.id, { count: 0, isLiked: false }));
      setContent("");
      clearMedia(false);
    } catch (error) {
      console.error("Error creating post:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async (postId: string) => {
    try {
      await localDb.from("boost_posts").delete().eq("id", postId);
      setPosts(posts.filter((post) => post.id !== postId));
    } catch (error) {
      console.error("Error deleting post:", error);
    }
  };

  const toggleLike = async (postId: string) => {
    const state = likes.get(postId);
    if (!state || !userId) return;
    try {
      if (state.isLiked) {
        await localDb.from("boost_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
        setLikes(new Map(likes).set(postId, { count: state.count - 1, isLiked: false }));
      } else {
        await localDb.from("boost_post_likes").insert({ post_id: postId, user_id: userId });
        setLikes(new Map(likes).set(postId, { count: state.count + 1, isLiked: true }));
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <form ref={formRef} onSubmit={handleSubmit}>
        <div
          className={`bg-gray-900 rounded-xl p-4 border transition-all duration-200 relative ${
            dragging ? "border-blue-500 ring-2 ring-blue-500/30" : "border-gray-700"
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {dragging && (
            <div className="absolute inset-0 z-10 bg-gray-900/90 rounded-xl flex items-center justify-center border-2 border-dashed border-blue-500">
              <p className="text-blue-400 text-sm font-medium">Drop image or video here</p>
            </div>
          )}
          <textarea
            ref={composerRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={mediaFile ? "Add a caption (optional)..." : "Write something to boost yourself or others..."}
            className="w-full bg-transparent text-white placeholder-gray-500 resize-none outline-none min-h-[100px]"
            maxLength={500}
          />
          {mediaPreview && (
            <div className="relative mt-3 rounded-lg overflow-hidden bg-black w-full">
              {mediaKind === "video" ? (
                <video
                  src={mediaPreview}
                  className={`max-h-64 object-contain ${previewPortrait ? "mx-auto" : "w-full"}`}
                  controls
                  muted
                  onLoadedMetadata={(event) => setPreviewPortrait(isPortraitVideo(event.currentTarget))}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={mediaPreview} className="max-h-64 w-full object-contain" alt="Preview" />
              )}
              <button
                type="button"
                onClick={() => clearMedia(true)}
                className="absolute top-2 right-2 bg-black/70 rounded-full p-1 hover:bg-black transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MEDIA}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) selectMedia(file);
            }}
            className="hidden"
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                title={hotkeyHint(isPublic ? "Make private" : "Make public", visibilityCombo)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>{isPublic ? "Public" : "Private"}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  mediaFile ? "text-blue-400" : "text-gray-400 hover:text-white"
                }`}
                title="Attach media"
              >
                <Paperclip className="w-4 h-4" />
                <span>Media</span>
              </button>
            </div>
            <button
              type="submit"
              disabled={(!content.trim() && !mediaFile) || submitting}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 rounded-lg transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{submitting ? "Posting..." : "Post"}</span>
            </button>
          </div>
        </div>
      </form>

      {posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No posts yet. Be the first to share a boost!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const like = likes.get(post.id) ?? NO_LIKES;
            return (
              <div key={post.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {post.workflow_generated && (
                      <div className="flex items-center gap-1 mb-2">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span className="text-xs text-purple-400">Auto-generated</span>
                      </div>
                    )}
                    {post.is_public && post.display_name && (
                      <p className="text-sm text-gray-400 mb-1">{post.display_name}</p>
                    )}
                    {post.post_type === "video" && post.video_url && <UploadedVideo src={post.video_url} />}
                    {post.post_type === "photo" && post.image_url && <UploadedPhoto src={post.image_url} />}
                    {post.content && <PostContent content={post.content} />}
                  </div>
                  {post.user_id === userId && (
                    <button
                      onClick={() => deletePost(post.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors p-1"
                      title="Delete post"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-2 text-sm transition-colors ${
                      like.isLiked ? "text-green-500" : "text-gray-500 hover:text-green-400"
                    }`}
                  >
                    <Handshake className={`w-4 h-4 ${like.isLiked ? "fill-current" : ""}`} />
                    <span>
                      {like.isLiked ? "Helped me" : "This helped me"}
                      {like.count > 0 && ` (${like.count})`}
                    </span>
                  </button>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      {post.is_public ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {post.is_public ? "Public" : "Private"}
                    </span>
                    <span>{formatPostDate(post.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
