import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, Send, MapPin, Wallet, Calendar, BarChart2,
  History, X, Archive, MessageSquarePlus, Bot, ThumbsUp, ThumbsDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
  closedAt: string | null;
}

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Posizioni", icon: MapPin,    message: "Dove si trovano i membri della famiglia adesso?" },
  { label: "Spese",     icon: Wallet,    message: "Come stiamo andando con le spese questo mese?" },
  { label: "Impegni",   icon: Calendar,  message: "Quali sono gli impegni più urgenti di oggi?" },
  { label: "Report",    icon: BarChart2, message: "Dammi un riepilogo generale della famiglia" },
];

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-2 mb-2">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="px-4 py-3 bg-muted rounded-2xl rounded-bl-sm flex items-center gap-1.5">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── History Sheet ────────────────────────────────────────────────────────────

function HistorySheet({
  conversations,
  isLoading,
  onSelect,
  onClose,
  onNewChat,
}: {
  conversations: Conversation[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Oggi";
    if (d.toDateString() === yesterday.toDateString()) return "Ieri";
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  return (
    <div
      className="absolute inset-0 z-[9999]"
      style={{
        background: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(4px)" : "blur(0px)",
        transition: "background 0.28s ease, backdrop-filter 0.28s ease",
      }}
      onClick={handleClose}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl overflow-hidden"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          maxHeight: "70vh",
          boxShadow: "0 -4px 40px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-bold text-base">Conversazioni precedenti</h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center active:bg-muted/70"
            data-testid="button-close-history"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-4 pt-3 pb-1">
          <button
            onClick={() => { setVisible(false); setTimeout(onNewChat, 220); }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 active:scale-[0.98] transition-transform"
            data-testid="button-new-chat"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <MessageSquarePlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Nuova conversazione</p>
              <p className="text-xs text-blue-500/70">Inizia una nuova chat con l'assistente</p>
            </div>
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto px-4 py-2 pb-6" style={{ maxHeight: "calc(70vh - 160px)" }}>
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">Nessuna conversazione precedente</p>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => { setVisible(false); setTimeout(() => onSelect(conv.id), 220); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted border border-border active:scale-[0.98] transition-all text-left"
                  data-testid={`conv-item-${conv.id}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {conv.title || "Conversazione con l'assistente"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(conv.updatedAt)}
                      {conv.closedAt && <span className="ml-2 text-muted-foreground/60">· Archiviata</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiFamilyChatPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ratedMessages, setRatedMessages] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingMsgIdRef = useRef<string>("");
  const streamingTextRef = useRef<string>("");

  const { data: conversations, isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/ai/chat/conversations"],
    enabled: showHistory,
  });

  // Scroll to bottom whenever messages or typing state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const feedbackMutation = useMutation({
    mutationFn: async ({ targetId, rating }: { targetId: string; rating: number }) => {
      await apiRequest("POST", "/api/ai/feedback", {
        targetType: "chat_message",
        targetId,
        rating,
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ message, conversationId: conversationId ?? undefined }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Errore nella risposta");
      }

      if (!res.body) throw new Error("Streaming non supportato");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let convId = conversationId;
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by double newline to separate SSE events
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          let eventType = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }

          if (eventType === 'meta' && data) {
            try {
              const meta = JSON.parse(data);
              convId = meta.conversationId;
            } catch {
              // Ignore parse errors
            }
          } else if (eventType === 'delta' && data) {
            try {
              const text = JSON.parse(data);
              fullText += text;
              streamingTextRef.current = fullText;

              // Update the assistant message in state incrementally
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMsgIdRef.current
                    ? { ...m, content: streamingTextRef.current }
                    : m
                )
              );
            } catch {
              // Ignore parse errors
            }
          } else if (eventType === 'error') {
            throw new Error(data || "Assistente non disponibile");
          }
        }
      }

      return { response: fullText, conversationId: convId! };
    },
    onMutate: (message) => {
      const userId = `u-${Date.now()}`;
      const assistantId = `a-${Date.now()}`;

      streamingMsgIdRef.current = assistantId;
      streamingTextRef.current = '';

      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: message, timestamp: new Date() },
        { id: assistantId, role: "assistant", content: '', timestamp: new Date() },
      ]);
      setIsTyping(true);
      setInput("");
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setIsTyping(false);
      streamingTextRef.current = '';
      streamingMsgIdRef.current = '';
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chat/conversations"] });
    },
    onError: (e: Error) => {
      setIsTyping(false);
      streamingTextRef.current = '';
      streamingMsgIdRef.current = '';
      toast({ title: "Errore", description: e.message, variant: "destructive" });
      // Remove the incomplete assistant message
      setMessages((prev) => prev.filter((m) => m.content !== ''));
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/ai/chat/conversations/${id}/close`, {});
    },
    onSuccess: () => {
      setMessages([]);
      setConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chat/conversations"] });
      toast({ title: "Conversazione archiviata" });
    },
    onError: (e: Error) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });

  const loadConversation = async (convId: string) => {
    try {
      const res = await apiRequest("GET", `/api/ai/chat/conversations/${convId}/messages`);
      const data = (await res.json()) as ConversationMessage[];
      setMessages(
        data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt),
        }))
      );
      setConversationId(convId);
      setShowHistory(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    }
  };

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (message: string) => {
    if (sendMutation.isPending) return;
    sendMutation.mutate(message);
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const isEmpty = messages.length === 0 && !isTyping;

  return (
    <div className="flex flex-col h-full">
      {/* AI info bar */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-[13px] font-semibold leading-tight">Assistente Famiglia</p>
            <p className="text-white/70 text-[11px]">Chiedi qualsiasi cosa sulla tua famiglia</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {conversationId && !sendMutation.isPending && (
            <button
              onClick={() => closeMutation.mutate(conversationId)}
              disabled={closeMutation.isPending}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
              title="Archivia conversazione"
              data-testid="button-archive-conversation"
            >
              <Archive className="w-3.5 h-3.5 text-white/80" />
            </button>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
            title="Storico conversazioni"
            data-testid="button-show-history"
          >
            <History className="w-3.5 h-3.5 text-white/80" />
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-4 py-2.5 flex gap-2 overflow-x-auto flex-shrink-0 border-b border-border scrollbar-hide">
        {QUICK_ACTIONS.map(({ label, icon: Icon, message }) => (
          <button
            key={label}
            onClick={() => handleQuickAction(message)}
            disabled={sendMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap
              bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300
              border border-blue-100 dark:border-blue-800
              hover:bg-blue-100 dark:hover:bg-blue-900/40
              active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
            data-testid={`quick-action-${label.toLowerCase()}`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEmpty ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-6 pb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-base mb-1.5">Assistente Famiglia</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Sono qui per aiutarti a tenere traccia di tutto ciò che riguarda la tua famiglia.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-xs">
              {QUICK_ACTIONS.map(({ label, icon: Icon, message }) => (
                <button
                  key={label}
                  onClick={() => handleQuickAction(message)}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/60 border border-border hover:bg-muted active:scale-95 transition-all text-left"
                  data-testid={`empty-quick-${label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 mb-2 ${isUser ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  <div className="w-8 flex-shrink-0">
                    {isUser ? (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: profile?.colorHex || "#3B82F6" }}
                      >
                        {profile?.name?.charAt(0) || "?"}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={`max-w-[75%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {formatTime(msg.timestamp)}
                    </span>
                    {!isUser && (
                      <div className="flex items-center gap-1 mt-0.5 px-1">
                        <button
                          onClick={() => {
                            feedbackMutation.mutate({ targetId: msg.id, rating: 1 });
                            setRatedMessages(prev => ({...prev, [msg.id]: 1}));
                          }}
                          disabled={!!ratedMessages[msg.id]}
                          className={`p-1 rounded-full transition-colors ${
                            ratedMessages[msg.id] === 1 ? 'text-green-500' : 'text-muted-foreground/40 hover:text-green-500'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            feedbackMutation.mutate({ targetId: msg.id, rating: -1 });
                            setRatedMessages(prev => ({...prev, [msg.id]: -1}));
                          }}
                          disabled={!!ratedMessages[msg.id]}
                          className={`p-1 rounded-full transition-colors ${
                            ratedMessages[msg.id] === -1 ? 'text-red-500' : 'text-muted-foreground/40 hover:text-red-500'
                          }`}
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isTyping && <TypingIndicator />}

            <div ref={bottomRef} />
          </div>
        )}

        {/* Anchor when empty */}
        {isEmpty && <div ref={bottomRef} />}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 bg-background flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Chiedi all'assistente…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[44px] max-h-28 resize-none"
            rows={1}
            disabled={sendMutation.isPending}
            data-testid="input-ai-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="h-11 w-11 flex-shrink-0"
            data-testid="button-send-ai-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* History sheet */}
      {showHistory && (
        <HistorySheet
          conversations={conversations || []}
          isLoading={loadingConversations}
          onSelect={loadConversation}
          onClose={() => setShowHistory(false)}
          onNewChat={() => {
            setMessages([]);
            setConversationId(null);
            setShowHistory(false);
          }}
        />
      )}
    </div>
  );
}
