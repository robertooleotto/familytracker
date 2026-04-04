import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useFamilyWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, MessageCircle, Check, CheckCheck } from "lucide-react";
import type { Message, Profile } from "@shared/schema";

interface MessageWithSender extends Message {
  sender: Profile;
}

export default function ChatPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fix #23: Real-time via WebSocket — 30s fallback polling instead of 3s
  const handleWsEvent = useCallback((event: { type: string }) => {
    if (event.type === "new_message" || event.type === "sos") {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    }
  }, []);
  useFamilyWebSocket(handleWsEvent);

  const { data: messages, isLoading } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/messages"],
    refetchInterval: 30000,
  });

  const { data: familyMembers } = useQuery<Profile[]>({
    queryKey: ["/api/family/members"],
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest("POST", "/api/messages", { body: text });
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
    onError: (e: Error) => toast({ title: "Failed to send", description: e.message, variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("POST", `/api/messages/${messageId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages && profile) {
      messages.forEach((msg) => {
        if (msg.senderId !== profile.id && !msg.readBy?.includes(profile.id)) {
          markReadMutation.mutate(msg.id);
        }
      });
    }
  }, [messages?.length]);

  const handleSend = () => {
    if (!body.trim()) return;
    sendMutation.mutate(body.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp: string | Date) => {
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  };

  const groupedMessages = messages?.reduce<{ date: string; messages: MessageWithSender[] }[]>((groups, msg) => {
    const date = formatDate(msg.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.messages.push(msg);
    } else {
      groups.push({ date, messages: [msg] });
    }
    return groups;
  }, []);

  const totalMembers = familyMembers?.length || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`flex gap-2 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-48" : "w-56"}`} />
              </div>
            ))}
          </div>
        ) : groupedMessages && groupedMessages.length > 0 ? (
          groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-center my-4">
                <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
                  {group.date}
                </span>
              </div>
              {group.messages.map((msg, i) => {
                const isOwn = msg.senderId === profile?.id;
                const showAvatar = i === 0 || group.messages[i - 1]?.senderId !== msg.senderId;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 mb-1 ${isOwn ? "flex-row-reverse" : ""}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <div className="w-8 flex-shrink-0">
                      {showAvatar && !isOwn && (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: msg.sender?.colorHex || "#3B82F6" }}
                          title={msg.sender?.name}
                        >
                          {msg.sender?.name?.charAt(0) || "?"}
                        </div>
                      )}
                    </div>
                    <div className={`max-w-xs lg:max-w-md ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                      {showAvatar && !isOwn && (
                        <span className="text-xs text-muted-foreground mb-1 px-1">{msg.sender?.name}</span>
                      )}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm ${
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        }`}
                      >
                        {msg.body}
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 px-1 ${isOwn ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs text-muted-foreground">{formatTime(msg.createdAt)}</span>
                        {isOwn && (
                          <span className="text-xs text-muted-foreground">
                            {(msg.readBy?.length || 0) >= totalMembers - 1 ? (
                              <CheckCheck className="w-3 h-3 text-primary" />
                            ) : msg.readBy && msg.readBy.length > 0 ? (
                              <CheckCheck className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation with your family!</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 bg-background">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Send a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[44px] max-h-28 resize-none"
            rows={1}
            data-testid="input-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!body.trim() || sendMutation.isPending}
            className="h-11 w-11 flex-shrink-0"
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
