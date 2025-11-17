import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";

const API_BASE_URL = window.location.origin;

const MAX_CHAT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHAT_FILES = 5;

interface TicketMEPType {
  ticket_number: string;
  creation_datetime: string;
  location: string;
  category: string;
  area_of_work: string;
  description: string;
  status: string;
  feedback?: string | null;
  assignee_email: string;
  empemail: string; // requester
}

interface HistoryEntry {
  id: number;
  ticket_number: string;
  user_id: string;
  comment?: string | null;
  action_type: string;
  before_state?: any;
  after_state?: any;
  timestamp: string;
}

type AttachmentPayload = {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};

interface ChatMessage {
  id: number;
  ticket_number: string;
  sender_email: string;
  message: string;
  created_at: string;
  attachments?: AttachmentPayload[] | null;
}

export default function TicketMEP() {
  const { ticketNumber } = useParams();
  const { userEmail } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketMEPType | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatAttachments, setChatAttachments] = useState<AttachmentPayload[]>(
    []
  );

  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);

  const isAssignee =
    !!ticket &&
    !!userEmail &&
    userEmail.toLowerCase() === ticket.assignee_email?.toLowerCase();
  // For MEP, requester is the employee who created it: empemail
  const isRequester =
    !!ticket &&
    !!userEmail &&
    userEmail.toLowerCase() === ticket.empemail?.toLowerCase();

  useEffect(() => {
    if (!ticketNumber) return;

    let isMounted = true;
    let chatInterval: number | undefined;

    const loadAll = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchTicketDetails(ticketNumber, isMounted),
          fetchHistory(ticketNumber, isMounted),
          fetchChatMessages(ticketNumber, isMounted),
        ]);

        // Start chat polling
        chatInterval = window.setInterval(() => {
          fetchChatMessages(ticketNumber, true).catch((err) =>
            console.error("Chat polling error:", err)
          );
        }, 5000);
      } catch (err) {
        console.error("Error loading ticket:", err);
        if (isMounted) {
          toast.error("Failed to load ticket");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAll();

    return () => {
      isMounted = false;
      if (chatInterval) {
        clearInterval(chatInterval);
      }
    };
  }, [ticketNumber]);

  const fetchTicketDetails = async (tNum: string, isMounted: boolean) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mep/${encodeURIComponent(tNum)}`,
        {
          credentials: "include",
        }
      );
      if (!res.ok) {
        if (res.status === 404 && isMounted) {
          setTicket(null);
        }
        return;
      }
      const data = (await res.json()) as TicketMEPType;
      if (isMounted) {
        setTicket(data);
        setFeedback(data.feedback || "");
      }
    } catch (err) {
      console.error("fetchTicketDetails error:", err);
      if (isMounted) {
        toast.error("Failed to load ticket details");
      }
    }
  };

  const fetchHistory = async (tNum: string, isMounted: boolean) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/history/${encodeURIComponent(tNum)}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as HistoryEntry[];
      if (isMounted) {
        setHistory(data || []);
      }
    } catch (err) {
      console.error("fetchHistory error:", err);
    }
  };

  const fetchChatMessages = async (tNum: string, isMounted: boolean) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/chat/${encodeURIComponent(tNum)}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as ChatMessage[];
      if (isMounted) {
        setMessages(data || []);
      }
    } catch (err) {
      console.error("fetchChatMessages error:", err);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!ticketNumber) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mep/${encodeURIComponent(ticketNumber)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!res.ok) {
        let message = "Failed to update status";
        try {
          const data = await res.json();
          if (data && data.error) message = data.error;
        } catch {
          // ignore
        }
        toast.error(message);
        return;
      }

      toast.success("Status updated successfully");
      // refresh ticket & history
      await Promise.all([
        fetchTicketDetails(ticketNumber, true),
        fetchHistory(ticketNumber, true),
      ]);
    } catch (error) {
      console.error("handleStatusUpdate error:", error);
      toast.error("Failed to update status");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !ticketNumber) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/chat/${encodeURIComponent(ticketNumber)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message: newMessage,
            attachments:
              chatAttachments.length > 0 ? chatAttachments : undefined,
          }),
        }
      );

      if (!res.ok) {
        let message = "Failed to send message";
        try {
          const data = await res.json();
          if (data && data.error) message = data.error;
        } catch {
          // ignore
        }
        toast.error(message);
        return;
      }

      const created = (await res.json()) as ChatMessage;
      setNewMessage("");
      setChatAttachments([]);
      setMessages((prev) => [...prev, created]);
    } catch (error) {
      console.error("handleSendMessage error:", error);
      toast.error("Failed to send message");
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!ticketNumber) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mep/${encodeURIComponent(ticketNumber)}/feedback`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ feedback }),
        }
      );

      if (!res.ok) {
        let message = "Failed to submit feedback";
        try {
          const data = await res.json();
          if (data && data.error) message = data.error;
        } catch {
          // ignore
        }
        toast.error(message);
        return;
      }

      toast.success("Feedback submitted successfully");
      await Promise.all([
        fetchTicketDetails(ticketNumber, true),
        fetchHistory(ticketNumber, true),
      ]);
    } catch (error) {
      console.error("handleFeedbackSubmit error:", error);
      toast.error("Failed to submit feedback");
    }
  };

  const handleChatAttachmentsChange = async (e: any) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Enforce max count including already selected attachments
    const remainingSlots = MAX_CHAT_FILES - chatAttachments.length;
    if (remainingSlots <= 0) {
      toast.error(`You can only attach up to ${MAX_CHAT_FILES} files.`);
      e.target.value = "";
      return;
    }

    const filesToUse = files.slice(0, remainingSlots);

    const newAttachments: AttachmentPayload[] = [];

    for (const file of filesToUse) {
      if (file.size > MAX_CHAT_FILE_SIZE_BYTES) {
        toast.error(
          `${file.name} is too large. Max size is ${Math.round(
            MAX_CHAT_FILE_SIZE_BYTES / (1024 * 1024)
          )} MB.`
        );
        continue;
      }

      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      newAttachments.push({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
      });
    }

    if (newAttachments.length === 0) {
      e.target.value = "";
      return;
    }

    setChatAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  if (loading) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-8">
            <p className="text-center">Loading ticket details...</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-8">
            <p className="text-center">Ticket not found</p>
            <Button
              onClick={() => navigate("/tickets")}
              className="mt-4 mx-auto block"
            >
              Back to Tickets
            </Button>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "outline",
      in_progress: "default",
      completed: "secondary",
      rejected: "destructive",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>MEP Request: {ticket.ticket_number}</CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Created:{" "}
                  {ticket.creation_datetime
                    ? format(new Date(ticket.creation_datetime), "PPpp")
                    : "-"}
                </p>
              </div>
              {getStatusBadge(ticket.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Location</Label>
                <p className="font-medium">{ticket.location}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Category</Label>
                <p className="font-medium">{ticket.category}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Area of Work</Label>
                <p className="font-medium">{ticket.area_of_work}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Assignee</Label>
                <p className="font-medium">{ticket.assignee_email}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="mt-1">{ticket.description}</p>
            </div>

            {isAssignee && (
              <div className="pt-4 border-t">
                <Label>Update Status</Label>
                <Select
                  value={ticket.status}
                  onValueChange={handleStatusUpdate}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {isRequester && ticket.status === "completed" && (
              <div className="pt-4 border-t">
                <Label>Feedback</Label>
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share your feedback..."
                  className="mt-2"
                  rows={3}
                />
                <Button onClick={handleFeedbackSubmit} className="mt-2">
                  Submit Feedback
                </Button>
              </div>
            )}

            {ticket.feedback && (
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">User Feedback</Label>
                <p className="mt-1 text-sm">{ticket.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4 mb-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.sender_email === userEmail
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        msg.sender_email === userEmail
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm font-medium mb-1">
                        {msg.sender_email}
                      </p>
                      <p className="text-sm">{msg.message}</p>

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.attachments.map((att, idx) =>
                            att.type && att.type.startsWith("image/") ? (
                              <div key={idx} className="mt-1">
                                <p className="text-xs mb-1">📎 {att.name}</p>
                                <img
                                  src={att.dataUrl}
                                  alt={att.name}
                                  className="max-h-40 rounded border"
                                />
                              </div>
                            ) : (
                              <div key={idx}>
                                <a
                                  href={att.dataUrl}
                                  download={att.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs underline break-all"
                                >
                                  📎 {att.name}
                                </a>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <p className="text-xs opacity-70 mt-1">
                        {msg.created_at
                          ? format(new Date(msg.created_at), "MMM dd, hh:mm a")
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                />
                <Button onClick={handleSendMessage} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <Input
                  type="file"
                  multiple
                  onChange={handleChatAttachmentsChange}
                />
                <p className="text-xs text-muted-foreground">
                  You can attach up to {MAX_CHAT_FILES} files, max 10 MB each.
                </p>
                {chatAttachments.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {chatAttachments.map((att) => (
                      <li key={att.name}>
                        {att.name} ({Math.round(att.size / 1024)} KB)
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between items-start border-b pb-2"
                >
                  <div>
                    <p className="font-medium">
                      {h.action_type.replace("_", " ").toUpperCase()}
                    </p>
                    {h.comment && (
                      <p className="text-sm text-muted-foreground">
                        {h.comment}
                      </p>
                    )}
                    {h.before_state != null && h.after_state != null && (
                      <p className="text-sm text-muted-foreground">
                        {JSON.stringify(h.before_state)} →{" "}
                        {JSON.stringify(h.after_state)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.timestamp
                      ? format(new Date(h.timestamp), "MMM dd, hh:mm a")
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
