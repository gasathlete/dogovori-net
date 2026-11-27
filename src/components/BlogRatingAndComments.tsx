// Reusable rating + comments block for both core blog posts and user articles.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Loader2, Trash2, MessageSquare } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type PostType = "core" | "user";

interface Props {
  postType: PostType;
  postSlug: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_name?: string | null;
  is_mine: boolean;
}

export function BlogRatingAndComments({ postType, postSlug }: Props) {
  const { user } = useAuth();
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [savingRating, setSavingRating] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const loadAggregate = async () => {
    const { data } = await supabase.rpc("get_post_rating", { _post_type: postType, _post_slug: postSlug });
    if (data && data[0]) {
      setAvg(Number(data[0].avg_rating ?? 0));
      setCount(Number(data[0].rating_count ?? 0));
    }
  };

  const loadMine = async () => {
    if (!user) { setMyRating(0); return; }
    const { data } = await supabase
      .from("blog_ratings")
      .select("rating")
      .eq("post_type", postType)
      .eq("post_slug", postSlug)
      .eq("user_id", user.id)
      .maybeSingle();
    setMyRating(data?.rating ?? 0);
  };

  const loadComments = async () => {
    setLoadingComments(true);
    // Read through the security-invoker view that never exposes user_id.
    // The view returns author_name (joined from profiles) and is_mine (auth.uid()
    // match) so the UI can render the delete button without enumerating user IDs.
    const { data: rows } = await (supabase as any)
      .from("blog_comments_public")
      .select("id, content, created_at, author_name, is_mine")
      .eq("post_type", postType)
      .eq("post_slug", postSlug)
      .order("created_at", { ascending: false });

    setComments((rows ?? []) as Comment[]);
    setLoadingComments(false);
  };

  useEffect(() => {
    loadAggregate();
    loadMine();
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postType, postSlug, user?.id]);

  const submitRating = async (value: number) => {
    if (!user) { toast.error("Влезте в профила си, за да оцените."); return; }
    setSavingRating(true);
    const { error } = await supabase
      .from("blog_ratings")
      .upsert({ post_type: postType, post_slug: postSlug, user_id: user.id, rating: value },
        { onConflict: "post_type,post_slug,user_id" });
    setSavingRating(false);
    if (error) { toast.error(error.message); return; }
    setMyRating(value);
    toast.success("Благодарим за оценката!");
    loadAggregate();
  };

  const submitComment = async () => {
    if (!user) { toast.error("Влезте в профила си."); return; }
    const text = draft.trim();
    if (text.length < 2) { toast.error("Коментарът е твърде кратък."); return; }
    if (text.length > 2000) { toast.error("Коментарът е твърде дълъг (макс. 2000 знака)."); return; }
    setPosting(true);
    const { error } = await supabase.from("blog_comments").insert({
      post_type: postType, post_slug: postSlug, user_id: user.id, content: text,
    });
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    loadComments();
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Изтриване на коментара?")) return;
    const { error } = await supabase.from("blog_comments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setComments((c) => c.filter((x) => x.id !== id));
  };

  const stars = [1, 2, 3, 4, 5];

  return (
    <section className="mt-16 border-t border-border/50 pt-10">
      {/* Rating */}
      <div className="rounded-xl border border-border/50 bg-card/30 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg font-bold">Оценете статията</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {count > 0
                ? `Средно ${avg.toFixed(1)} от ${count} ${count === 1 ? "оценка" : "оценки"}`
                : "Все още няма оценки"}
            </p>
          </div>
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {stars.map((v) => {
              const active = (hover || myRating) >= v;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={savingRating || !user}
                  onMouseEnter={() => setHover(v)}
                  onClick={() => submitRating(v)}
                  className="p-1 transition-transform disabled:cursor-not-allowed hover:scale-110"
                  aria-label={`${v} ${v === 1 ? "звезда" : "звезди"}`}
                >
                  <Star className={`h-6 w-6 ${active ? "fill-gold text-gold" : "text-muted-foreground/70"}`} />
                </button>
              );
            })}
          </div>
        </div>
        {!user && (
          <p className="mt-3 text-xs text-muted-foreground">
            <Link to="/auth" className="text-gold hover:underline">Влезте</Link>, за да оцените и коментирате.
          </p>
        )}
      </div>

      {/* Comments */}
      <div className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-gold" />
          <h3 className="font-serif text-xl font-bold">Коментари ({comments.length})</h3>
        </div>

        {user ? (
          <div className="mb-6 rounded-lg border border-border/50 bg-card/30 p-4">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Споделете мнението си..."
              maxLength={2000}
              rows={3}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{draft.length}/2000</span>
              <Button onClick={submitComment} disabled={posting || draft.trim().length < 2}>
                {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Публикувай
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-border/50 bg-card/30 p-4 text-sm text-muted-foreground">
            <Link to="/auth" className="text-gold hover:underline">Влезте</Link>, за да оставите коментар.
          </div>
        )}

        {loadingComments ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Бъдете първи с коментар.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/50 bg-card/30 p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {c.author_name || "Потребител"}
                  </span>
                  <div className="flex items-center gap-2">
                    <time className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("bg-BG", { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                    {c.is_mine && (
                      <button onClick={() => deleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
