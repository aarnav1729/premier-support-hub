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

// 👇 NEW: fixed transport assignee email
const TRANSPORT_ASSIGNEE_EMAIL = "krishnaiah.donta@premierenergies.com";

interface TicketVRType {
  ticket_number: string;
  creation_datetime: string;
  number_of_people: number;
  employee_or_guest: "employee" | "guest" | string;
  pickup_datetime: string;
  drop_datetime: string;
  contact_number: string;
  assignee_email: string;
  names: string[];
  purpose_of_visit: string;
  description?: string | null;
  driver_name?: string | null;
  driver_number?: string | null;
  feedback?: string | null;
  status: string;
  user_email: string;
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
  dataUrl: string; // base64 data URL
};

interface ChatMessage {
  id: number;
  ticket_number: string;
  sender_email: string;
  message: string;
  created_at: string;
  attachments?: AttachmentPayload[] | null;
}

export default function TicketVR() {
  const { ticketNumber } = useParams();
  const { userEmail } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketVRType | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatAttachments, setChatAttachments] = useState<AttachmentPayload[]>(
    []
  );

  const [feedback, setFeedback] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverNumber, setDriverNumber] = useState("");
  const [loading, setLoading] = useState(true);

  // 👇 normalize email once
  const userEmailLower = (userEmail || "").toLowerCase();

  const isAssignee =
    !!ticket &&
    !!userEmailLower &&
    userEmailLower === ticket.assignee_email?.toLowerCase();

  const isRequester =
    !!ticket &&
    !!userEmailLower &&
    userEmailLower === ticket.user_email?.toLowerCase();

  // 👇 NEW: only transport (Krishnaiah) should handle status/driver updates
  const isTransportAssignee =
    !!ticket &&
    !!userEmailLower &&
    userEmailLower === TRANSPORT_ASSIGNEE_EMAIL &&
    userEmailLower === ticket.assignee_email?.toLowerCase();

  // 👇 NEW: manager stage = assignee at pending_manager but NOT transport
  const isManagerStageAssignee =
    !!ticket &&
    !!userEmailLower &&
    ticket.status === "pending_manager" &&
    userEmailLower === ticket.assignee_email?.toLowerCase() &&
    userEmailLower !== TRANSPORT_ASSIGNEE_EMAIL;

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

        chatInterval = window.setInterval(() => {
          fetchChatMessages(ticketNumber, true).catch((err) =>
            console.error("Chat polling error:", err)
          );
        }, 5000);
      } catch (err) {
        console.error("Error loading VR ticket:", err);
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
      if (chatInterval) clearInterval(chatInterval);
    };
  }, [ticketNumber]);

  const fetchTicketDetails = async (tNum: string, isMounted: boolean) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/vr/${encodeURIComponent(tNum)}`,
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
      const data = (await res.json()) as TicketVRType;
      if (isMounted) {
        setTicket(data);
        setFeedback(data.feedback || "");
        setDriverName(data.driver_name || "");
        setDriverNumber(data.driver_number || "");
      }
    } catch (err) {
      console.error("fetchTicketDetails error:", err);
      if (isMounted) toast.error("Failed to load ticket details");
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
      if (isMounted) setHistory(data || []);
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
      if (isMounted) setMessages(data || []);
    } catch (err) {
      console.error("fetchChatMessages error:", err);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!ticketNumber) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/vr/${encodeURIComponent(ticketNumber)}/status`,
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
      await Promise.all([
        fetchTicketDetails(ticketNumber, true),
        fetchHistory(ticketNumber, true),
      ]);
    } catch (error) {
      console.error("handleStatusUpdate error:", error);
      toast.error("Failed to update status");
    }
  };

  const handleDriverUpdate = async () => {
    if (!ticketNumber) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/vr/${encodeURIComponent(ticketNumber)}/driver`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            driver_name: driverName,
            driver_number: driverNumber,
          }),
        }
      );

      if (!res.ok) {
        let message = "Failed to update driver details";
        try {
          const data = await res.json();
          if (data && data.error) message = data.error;
        } catch {
          // ignore
        }
        toast.error(message);
        return;
      }

      toast.success("Driver details updated successfully");
      await Promise.all([
        fetchTicketDetails(ticketNumber, true),
        fetchHistory(ticketNumber, true),
      ]);
    } catch (error) {
      console.error("handleDriverUpdate error:", error);
      toast.error("Failed to update driver details");
    }
  };

  const handleChatAttachmentsChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setChatAttachments([]);
      return;
    }

    const fileArray = Array.from(files).slice(0, MAX_CHAT_FILES);
    const oversized = fileArray.find((f) => f.size > MAX_CHAT_FILE_SIZE_BYTES);
    if (oversized) {
      toast.error(
        `File "${oversized.name}" is larger than 10 MB. Please choose smaller files.`
      );
      e.target.value = "";
      return;
    }

    Promise.all<AttachmentPayload>(
      fileArray.map(
        (file) =>
          new Promise<AttachmentPayload>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              resolve({
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: typeof result === "string" ? result : "",
              });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    )
      .then((payloads) => {
        setChatAttachments(payloads);
      })
      .catch((err) => {
        console.error("Error reading chat attachments:", err);
        toast.error("Failed to process attachments");
        setChatAttachments([]);
      });
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
        `${API_BASE_URL}/api/vr/${encodeURIComponent(ticketNumber)}/feedback`,
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
      pending_manager: "outline",
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
                <CardTitle>Vehicle Request: {ticket.ticket_number}</CardTitle>
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
                <Label className="text-muted-foreground">
                  Number of People
                </Label>
                <p className="font-medium">{ticket.number_of_people}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <p className="font-medium capitalize">
                  {ticket.employee_or_guest}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  Pickup Date &amp; Time
                </Label>
                <p className="font-medium">
                  {ticket.pickup_datetime
                    ? format(new Date(ticket.pickup_datetime), "PPpp")
                    : "-"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">
                  Drop Date &amp; Time
                </Label>
                <p className="font-medium">
                  {ticket.drop_datetime
                    ? format(new Date(ticket.drop_datetime), "PPpp")
                    : "-"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Contact Number</Label>
                <p className="font-medium">{ticket.contact_number}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Assignee</Label>
                <p className="font-medium">{ticket.assignee_email}</p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Passengers</Label>
              <div className="mt-1 space-y-1">
                {(ticket.names || []).map((name: string, idx: number) => (
                  <p key={idx} className="text-sm">
                    {idx + 1}. {name}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Purpose of Visit</Label>
              <p className="mt-1">{ticket.purpose_of_visit}</p>
            </div>

            {ticket.description && (
              <div>
                <Label className="text-muted-foreground">
                  Additional Details
                </Label>
                <p className="mt-1 text-sm">{ticket.description}</p>
              </div>
            )}

            {/* 👇 NEW: manager approval UI for pending_manager stage */}
            {isManagerStageAssignee && (
              <div className="pt-4 border-t space-y-3">
                <Label>Manager Approval</Label>
                <p className="text-xs text-muted-foreground">
                  Approve to forward this request to the transport team (
                  {TRANSPORT_ASSIGNEE_EMAIL}). Reject if the request is not
                  valid.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button onClick={() => handleStatusUpdate("pending")}>
                    Approve &amp; Forward
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleStatusUpdate("rejected")}
                  >
                    Reject Request
                  </Button>
                </div>
              </div>
            )}

            {/* 👇 UPDATED: only transport assignee sees status + driver inputs,
                and never in pending_manager stage */}
            {isTransportAssignee && ticket.status !== "pending_manager" && (
              <>
                <div className="pt-4 border-t space-y-4">
                  <div>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Driver Name</Label>
                      <Input
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Enter driver name"
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label>Driver Number</Label>
                      <Input
                        value={driverNumber}
                        onChange={(e) => setDriverNumber(e.target.value)}
                        placeholder="Enter driver number"
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <Button onClick={handleDriverUpdate}>
                    Update Driver Details
                  </Button>
                </div>
              </>
            )}

            {ticket.driver_name && (
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">Driver Details</Label>
                <p className="mt-1">
                  <strong>Name:</strong> {ticket.driver_name}
                </p>
                <p>
                  <strong>Number:</strong> {ticket.driver_number}
                </p>
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
